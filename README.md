# СТИ ФотоБот

Тестовая версия Telegram-бота для проекта «Объектив техникума».

## Что уже работает

- /start
- /publish
- /myphotos
- /help
- /cancel
- отправка фотографии
- название фотографии
- выбор категории
- имя автора
- подтверждение публикации
- тестовое подтверждение публикации

## Важно

Firebase пока НЕ подключён. Данные публикаций хранятся только во временной памяти процесса.

Telegram BOT_TOKEN не нужно помещать в GitHub.

## Render

Build Command:
npm install

Start Command:
npm start

Environment Variable:
BOT_TOKEN = токен твоего бота из BotFather

После сохранения переменной сделай Manual Deploy / Deploy latest commit.

## GitHub

Загрузи в корень репозитория:

- bot.js
- package.json
- .env.example
- .gitignore
- README.md

Не загружай настоящий .env и не публикуй токен бота.
