/** ___ __   __   ___
 *   | /  \ |__) |__  \_/
 *   | \__/ |  \ |___ / \

 *
 * @copyright © 2022 foammy
 */

// Импорт зависимостей
import { Telegraf } from 'telegraf'
import YAML from 'yaml'
import Markov from 'markov-generator'

// Импорт системных модулей
import { readFileSync } from 'fs'

import dotenv from 'dotenv';
dotenv.config();


// Импорт компонентов ядра
import Logger from './logger.js'
import Utils from './utils.js'
import DataManager from './data_manager.js'

// Парсинг конфигураций проекта
const config = YAML.parse(readFileSync('config.yml', 'utf8'))
const project = JSON.parse(readFileSync('package.json', 'utf8'))

// Инициализация Telegraf
const tg = new Telegraf(config.longpoll.token)

// Сообщение о запуске
Logger.info(`Torex Bot v${project.version} запущен`)

// Сообщение о подключении к TG API
Logger.info('Подключение к TG API ...')

// Старт получения событий TG
tg.launch().then(() => {
	Logger.info('TG API подключено')
})

// Обработчик сообщений TG
tg.on('text', async ctx => {

  // Игнорирование лишних сообщений
  if (ctx.chat.type != 'group' && ctx.chat.type != 'supergroup') return
  if (config.messages.active_chats != 'all' && !config.messages.active_chats.includes(ctx.chat.id)) return

  // Логирование сообщений
  Logger.info(`#${ctx.chat.id} ${ctx.from.id} -> ${ctx.message.text || '<no_text>'}`)

  // Получение чата из БД (название переименовано по причине существования такого типа в TG API)
  ctx.chats = DataManager.getChat(ctx.chat.id)

  // Запись сообщения в БД
  if (ctx.message.text && config.database.data_save && !ctx.chats.data.includes(ctx.message.text)) DataManager.writeChatData(ctx.chat.id, ctx.message.text)

  // Генерация сообщения с определенным шансом
  if (Utils.getWithChance(config.messages.chance)) {

    // Сообщение в консоль о генерации текста
    Logger.info(`#${ctx.chat.id} Генерация текста ...`)

    // Генерация текста
    // * Если данных будет недостаточно произойдет ошибка <<Maximum call stack size exceeded>>
    const sentence = new Markov({input: ctx.chats.data, minLength: config.generation.min_words}).makeChain()

    // Форматирование текста (если включено)
    const formatted_sentence = config.messages.format ? Utils.formatString(sentence) : sentence

    // Предупреждение при превышении лимита символов
    if (formatted_sentence.split('').length > config.messages.symbols_limit) return Logger.warn(`#${ctx.chat.id} Превышен лимит символов (${formatted_sentence.split('').length}/${config.messages.symbols_limit})`)

    // Установка статуса набора текста
    tg.telegram.sendChatAction(ctx.chat.id, 'typing')

    // Задержка перед отправкой сообщений для имитации написания (если включено)
    // * Высчитывается на основе количества символов в сгенерированном тексте
    if (config.messages.writing_imitation) await Utils.sleep(formatted_sentence.split('').length + '00')

    // Отправка сообщения
    ctx.reply(formatted_sentence).then(() => Logger.info(`#${ctx.chat.id} Сообщение сгенерировано ("${sentence}")`))
  }
})
