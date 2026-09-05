const { Telegraf, Markup } = require("telegraf");
const http = require("http");

// ======================================================
// НАСТРОЙКИ
// ======================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  "https://stisait-23039-default-rtdb.firebaseio.com";

if (!BOT_TOKEN) {
  throw new Error("❌ Переменная BOT_TOKEN не задана в Render");
}

const bot = new Telegraf(BOT_TOKEN);

// Временные данные пользователей.
// Важно: после перезапуска Render эти данные сбрасываются.
const sessions = new Map();

// ======================================================
// КАТЕГОРИИ
// ======================================================

const categories = [
  ["🏫 Техникум", "Техникум"],
  ["🧑‍🎓 Студенты", "Студенты"],
  ["🌳 Прогулки", "Прогулки"],
  ["🏆 Спорт", "Спорт"],
  ["🎨 Творчество", "Творчество"],
  ["😂 Смешные фото", "Смешные фото"],
  ["📷 Другое", "Другое"],
];

// ======================================================
// КЛАВИАТУРЫ
// ======================================================

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "📸 Опубликовать фотографию",
        "publish"
      ),
    ],
    [
      Markup.button.callback(
        "🖼️ Мои публикации",
        "myphotos"
      ),
      Markup.button.callback(
        "❓ Помощь",
        "help"
      ),
    ],
  ]);
}

function categoryKeyboard() {
  return Markup.inlineKeyboard(
    categories.map(([name, value]) => [
      Markup.button.callback(
        name,
        `category:${value}`
      ),
    ])
  );
}

function confirmationKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "✅ Опубликовать",
        "confirm_publish"
      ),
    ],
    [
      Markup.button.callback(
        "❌ Отмена",
        "cancel_publish"
      ),
    ],
  ]);
}

// ======================================================
// FIREBASE REALTIME DATABASE
// ======================================================

async function firebaseRequest(path, options = {}) {
  const url =
    `${FIREBASE_DATABASE_URL.replace(/\/$/, "")}` +
    `/${path}.json`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Firebase error ${response.status}: ${text}`
    );
  }

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

// Добавление новой записи
async function firebasePush(path, data) {
  return await firebaseRequest(path, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Получение данных
async function firebaseGet(path) {
  return await firebaseRequest(path, {
    method: "GET",
  });
}

// ======================================================
// /START
// ======================================================

bot.start(async (ctx) => {
  sessions.delete(ctx.from.id);

  await ctx.reply(
    "📸 Добро пожаловать в СТИ ФотоБот!\n\n" +

    "Здесь ты можешь отправить фотографию " +
    "и поделиться ею с другими студентами через " +
    "фотоархив «Объектив техникума».\n\n" +

    "Что можно сделать:\n" +
    "📷 Опубликовать фотографию\n" +
    "🖼️ Посмотреть свои публикации\n" +
    "👤 Указать имя автора\n\n" +

    "Каждый кадр — часть истории нашего техникума. ❤️\n\n" +

    "Выбирай действие ниже:",
    
    mainKeyboard()
  );
});

// ======================================================
// КОМАНДА /PUBLISH
// ======================================================

bot.command("publish", async (ctx) => {
  sessions.set(ctx.from.id, {
    step: "photo",
  });

  await ctx.reply(
    "📷 Отлично!\n\n" +
    "Теперь отправь мне фотографию.\n\n" +
    "После этого я попрошу:\n" +
    "📝 название\n" +
    "📂 категорию\n" +
    "👤 имя автора"
  );
});

// ======================================================
// КНОПКА «ОПУБЛИКОВАТЬ»
// ======================================================

bot.action("publish", async (ctx) => {
  await ctx.answerCbQuery();

  sessions.set(ctx.from.id, {
    step: "photo",
  });

  await ctx.reply(
    "📷 Отлично!\n\n" +
    "Теперь отправь мне фотографию.\n\n" +
    "После этого я попрошу:\n" +
    "📝 название\n" +
    "📂 категорию\n" +
    "👤 имя автора"
  );
});

// ======================================================
// ПОЛУЧЕНИЕ ФОТОГРАФИИ
// ======================================================

bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  const session = sessions.get(userId);

  if (!session || session.step !== "photo") {
    await ctx.reply(
      "📸 Сначала нажми «Опубликовать фотографию»."
    );
    return;
  }

  // Telegram отправляет несколько размеров фотографии.
  // Берём самое большое изображение.
  const photos = ctx.message.photo;

  const bestPhoto =
    photos[photos.length - 1];

  // Сохраняем Telegram file_id.
  session.photoFileId = bestPhoto.file_id;

  session.step = "title";

  await ctx.reply(
    "✅ Фотография получена!\n\n" +
    "📝 Теперь напиши название фотографии."
  );
});

// ======================================================
// ОБРАБОТКА ТЕКСТА
// ======================================================

bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  const session = sessions.get(userId);

  if (!session) {
    return;
  }

  // ----------------------------------------------
  // ОТМЕНА
  // ----------------------------------------------

  if (text === "/cancel") {
    sessions.delete(userId);

    await ctx.reply(
      "❌ Публикация отменена.",
      mainKeyboard()
    );

    return;
  }

  // ----------------------------------------------
  // НАЗВАНИЕ
  // ----------------------------------------------

  if (session.step === "title") {
    session.title = text;

    session.step = "category";

    await ctx.reply(
      "📂 Теперь выбери категорию:",
      categoryKeyboard()
    );

    return;
  }

  // ----------------------------------------------
  // ИМЯ АВТОРА
  // ----------------------------------------------

  if (session.step === "author") {
    session.authorName = text;

    session.step = "confirmation";

    await ctx.reply(
      "📸 Готово к публикации!\n\n" +

      `📝 Название: ${session.title}\n` +
      `📂 Категория: ${session.category}\n` +
      `👤 Автор: ${session.authorName}\n\n` +

      "Всё правильно?",
      
      confirmationKeyboard()
    );

    return;
  }
});

// ======================================================
// ВЫБОР КАТЕГОРИИ
// ======================================================

bot.action(/^category:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;

  const session = sessions.get(userId);

  if (!session || session.step !== "category") {
    await ctx.reply(
      "⚠️ Публикация не найдена.\n\n" +
      "Начни заново: /publish"
    );

    return;
  }

  session.category = ctx.match[1];

  session.step = "author";

  await ctx.reply(
    "👤 Теперь напиши имя автора фотографии."
  );
});

// ======================================================
// ПОДТВЕРЖДЕНИЕ ПУБЛИКАЦИИ
// ======================================================

bot.action("confirm_publish", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id;

  const session = sessions.get(userId);

  if (
    !session ||
    session.step !== "confirmation"
  ) {
    await ctx.reply(
      "⚠️ Данные публикации потерялись.\n\n" +
      "Начни заново: /publish"
    );

    sessions.delete(userId);

    return;
  }

  // ====================================================
  // ДАННЫЕ, КОТОРЫЕ СОХРАНИМ В FIREBASE
  // ====================================================

  const publication = {

    // Основные данные
    title: session.title,

    category: session.category,

    authorName: session.authorName,

    // Telegram
    telegramFileId: session.photoFileId,

    telegramUserId: userId,

    telegramUsername:
      ctx.from.username || null,

    // Статус публикации
    status: "published",

    // Время
    createdAt: Date.now(),
  };

  try {

    // Сохраняем в:
    // photos/{автоматический-ID}

    const result =
      await firebasePush(
        "photos",
        publication
      );

    sessions.delete(userId);

    await ctx.editMessageText(
      "✅ Фотография опубликована!\n\n" +

      "📸 Она сохранена в Firebase " +
      "Realtime Database.\n\n" +

      `📝 ${publication.title}\n` +
      `📂 ${publication.category}\n` +
      `👤 ${publication.authorName}\n\n` +

      "Теперь её можно будет вывести " +
      "на сайте «Объектив техникума». ❤️"
    );

    console.log(
      "Новая публикация:",
      result
    );

  } catch (error) {

    console.error(
      "❌ Ошибка Firebase:",
      error
    );

    await ctx.reply(
      "❌ Не удалось сохранить фотографию.\n\n" +

      "Проверь:\n" +
      "1. FIREBASE_DATABASE_URL в Render\n" +
      "2. Rules Realtime Database\n" +
      "3. Что база Firebase существует"
    );
  }
});

// ======================================================
// ОТМЕНА ПУБЛИКАЦИИ
// ======================================================

bot.action("cancel_publish", async (ctx) => {
  await ctx.answerCbQuery();

  sessions.delete(ctx.from.id);

  try {
    await ctx.editMessageText(
      "❌ Публикация отменена."
    );
  } catch (error) {
    console.error(error);
  }

  await ctx.reply(
    "Что хочешь сделать?",
    mainKeyboard()
  );
});

// ======================================================
// МОИ ПУБЛИКАЦИИ
// ======================================================

bot.command("myphotos", async (ctx) => {
  try {

    const data =
      await firebaseGet(
        "photos"
      );

    if (!data) {
      await ctx.reply(
        "🖼️ У тебя пока нет публикаций."
      );

      return;
    }

    const publications =
      Object.entries(data)
        .map(([id, item]) => ({
          id,
          ...item,
        }))
        .filter(
          (item) =>
            String(item.telegramUserId) ===
            String(ctx.from.id)
        )
        .sort(
          (a, b) =>
            (b.createdAt || 0) -
            (a.createdAt || 0)
        );

    if (publications.length === 0) {
      await ctx.reply(
        "🖼️ У тебя пока нет публикаций."
      );

      return;
    }

    let message =
      `🖼️ Твои публикации: ${publications.length}\n\n`;

    publications
      .slice(0, 20)
      .forEach((item, index) => {

        message +=
          `${index + 1}. 📸 ${item.title}\n` +
          `   📂 ${item.category}\n` +
          `   👤 ${item.authorName}\n\n`;
      });

    await ctx.reply(message);

  } catch (error) {

    console.error(
      "❌ Ошибка получения публикаций:",
      error
    );

    await ctx.reply(
      "❌ Не удалось получить публикации."
    );
  }
});

// ======================================================
// КНОПКА «МОИ ПУБЛИКАЦИИ»
// ======================================================

bot.action("myphotos", async (ctx) => {
  await ctx.answerCbQuery();

  try {

    const data =
      await firebaseGet(
        "photos"
      );

    if (!data) {
      await ctx.reply(
        "🖼️ У тебя пока нет публикаций."
      );

      return;
    }

    const publications =
      Object.values(data)
        .filter(
          (item) =>
            String(item.telegramUserId) ===
            String(ctx.from.id)
        )
        .sort(
          (a, b) =>
            (b.createdAt || 0) -
            (a.createdAt || 0)
        );

    if (publications.length === 0) {
      await ctx.reply(
        "🖼️ У тебя пока нет публикаций."
      );

      return;
    }

    let message =
      `🖼️ Твои публикации: ${publications.length}\n\n`;

    publications
      .slice(0, 20)
      .forEach((item, index) => {

        message +=
          `${index + 1}. 📸 ${item.title}\n` +
          `   📂 ${item.category}\n` +
          `   👤 ${item.authorName}\n\n`;
      });

    await ctx.reply(message);

  } catch (error) {

    console.error(error);

    await ctx.reply(
      "❌ Не удалось получить публикации."
    );
  }
});

// ======================================================
// HELP
// ======================================================

bot.command("help", async (ctx) => {
  await ctx.reply(
    "❓ Помощь\n\n" +

    "/start — главное меню\n" +
    "/publish — опубликовать фотографию\n" +
    "/myphotos — мои публикации\n" +
    "/cancel — отменить публикацию\n" +
    "/help — помощь\n\n" +

    "📸 Фотографии сохраняются через " +
    "Firebase Realtime Database."
  );
});

// ======================================================
// КНОПКА HELP
// ======================================================

bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    "❓ Помощь\n\n" +

    "📸 Опубликовать фотографию — " +
    "загрузить новый кадр\n\n" +

    "🖼️ Мои публикации — " +
    "посмотреть свои фотографии\n\n" +

    "/cancel — отменить текущую публикацию"
  );
});

// ======================================================
// ОБРАБОТКА ОШИБОК TELEGRAM
// ======================================================

bot.catch((error) => {
  console.error(
    "❌ Ошибка Telegram-бота:",
    error
  );
});

// ======================================================
// HTTP-СЕРВЕР ДЛЯ RENDER
// ======================================================

const PORT =
  Number(process.env.PORT) || 10000;

const server = http.createServer(
  (req, res) => {

    res.writeHead(
      200,
      {
        "Content-Type":
          "text/plain; charset=utf-8",
      }
    );

    res.end(
      "СТИ ФотоБот работает! 📸"
    );
  }
);

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 HTTP сервер запущен на порту ${PORT}`
    );
  }
);

// ======================================================
// ЗАПУСК БОТА
// ======================================================

bot.launch()
  .then(() => {

    console.log(
      "📸 СТИ ФотоБот запущен!"
    );

    console.log(
      "🔥 Firebase:",
      FIREBASE_DATABASE_URL
    );

  })
  .catch((error) => {

    console.error(
      "❌ Не удалось запустить бота:",
      error
    );

    process.exit(1);
  });

// ======================================================
// КОРРЕКТНОЕ ЗАВЕРШЕНИЕ
// ======================================================

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);