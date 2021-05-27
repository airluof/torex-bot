/** __   __   __  ___  ___
 * /  ' /  \ |__)  |  |__  \_/
 * \__, \__/ |  \  |  |___ / \
 * 
 * @copyright © 2021 hepller
 */

// Импорт модулей
import {VK} from 'vk-io'
import YAML from 'yaml'
import Markov from 'markov-generator'
import fs from 'fs'
import Logger from './logger.js'

/** Конфиг */
let config = YAML.parse(fs.readFileSync('config.yml', 'utf8'))

// БД и файл проекта
const db = JSON.parse(fs.readFileSync('data.json', 'utf8'))
const project = JSON.parse(fs.readFileSync('package.json', 'utf8'))

/** VK API */
const vk = new VK({token: config.vk_api.token, v: 5.130, apiLimit: 1})

/**
 * Сохраняет БД
 * @param {object} data БД
 */
db.write = (data) => {
  fs.writeFileSync('data.json', JSON.stringify(data, null, '\t'))
}

/**
 * Получает объект чата из БД
 * @param {number} id ID чата
 */
db.getChat = (id) => {

  // Поиск чата по ID
  let chat = db.chats.find(chat => chat.id == id)

  // Создание нового объекта чата при отсутствии
  if (!chat) {

    // Добавление в БД
    db.chats.push({id: id, data: []})

    // Запись БД
    db.write(db)

    // Получение из БД
    chat = db.chats.find(chat => chat.id == id)
  }

  // Возвращение объекта чата
  return chat
}

// Сообщения при запуске
Logger.info(`Cortex Bot v${project.version}`)
Logger.info('Подключение к VK API ...')

// Перезагрузка конфигурации при её изменении
watchFile('./config.yml', async () => {

  // Парсинг
  config = YAML.parse(fs.readFileSync('config.yml', 'utf8'))

  // Запись в лог
  Logger.info('Конфигурация перезагружена')
})

// Старт получения обновлений ВК
vk.updates.startPolling().then(() => Logger.info('VK API подключено'))

// Обработчик сообщений ВК
vk.updates.on('message_new', async ctx => {

  // Игнорирование лишних сообщений
  if (!ctx.isChat) return
  if (config.messages.active_chats != 'all' && !config.messages.active_chats.includes(ctx.chatId)) return

  // Логирование сообщений
  Logger.info(`#${ctx.chatId} ${ctx.senderId} ${ctx.isOutbox ? '<-' : '->'} ${ctx?.text ? ctx.text : '<no_text>'} ${ctx?.attachments}`)

  // Завершение функции, если сообщение исходящее или от сообщества
  if (ctx.isOutbox || ctx.isGroup) return

  // Объект пользователя
  ctx.chat = await db.getChat(ctx.chatId)

  // Запись сообщения в БД
  if (ctx.text && config.database.data_save && !ctx.chat.data.includes(ctx.text)) {

    // Запись в БД
    db.chats.find(chat => chat.id == ctx.chatId).data.push(ctx.text)

    // Сохранение БД
    db.write(db)
  }

  // Генерация сообщения с определенным шансом
  if (Math.random() * 100 < config.messages.chance) {

    // Сообщение в консоль о генерации текста
    Logger.info('Генерация текста ...')

    // Генерация текста
    // Если данных будет недостаточно произойдет ошибка <<Maximum call stack size exceeded>>
    let sentence = new Markov(getChat().data, config.generation.min_words).makeChain()

    // Форматирование текста
    if (config.messages.format.to_lower_case) sentence = sentence.toLowerCase()
    if (config.messages.format.capitalize_word) sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1)
    if (config.messages.format.end_dot) sentence = sentence + '.'

    // Предупреждение при превышении лимита символов
    if (sentence.split('').length > config.messages.symbols_limit) return Logger.warn(`#${ctx.chatId} Превышен лимит символов (${sentence.split('').length}/${config.messages.symbols_limit})`)

    // Статус набора текста
    await ctx.setActivity()

    // Задержка перед отправкой сообщений
    // Высчитывается на основе количества символов в сгенерированном тексте для имитации написания
    await new Promise(resolve => setTimeout(resolve, sentence.split('').length * 2 + '00'))

    // Отправка сообщения
    await ctx.send(sentence)
  }
})

// Обработчики ошибок
process.on('uncaughtException', error => Logger.error(error))
process.on('unhandledRejection', error => Logger.error(error))