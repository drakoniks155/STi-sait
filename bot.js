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
  throw new Error("BOT_TOKEN не задан");
}

const bot = new Telegraf(BOT_TOKEN);

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
// FIREBASE
// ======================================================

async function firebaseRequest(path, options = {}) {

  const baseUrl =
    FIREBASE_DATABASE_URL.replace(/\/$/, "");

  const url = `${baseUrl}/${path}.json`;

  console.log("================================");
  console.log("FIREBASE REQUEST");
  console.log("URL:", url);
  console.log("METHOD:", options.method || "GET");
  console.log("================================");

  try {

    const response = await fetch(url, {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();

    console.log("Firebase status:", response.status);
    console.log("Firebase response:", text);

    if (!response.ok) {

      throw new Error(
        `Firebase HTTP ${response.status}: ${text}`
      );
    }

    if (!text) {
      return null;
    }

    return JSON.parse(text);

  } catch (error) {

    console.error(
      "FIREBASE ERROR:",
      error
    );

    throw error;
  }
}

// ======================================================
// ДОБАВЛЕНИЕ ЗАПИСИ
// ======================================================

async function firebasePush(path, data) {

  return await firebaseRequest(
    path,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

// ======================================================
// ПОЛУЧЕНИЕ ЗАПИСЕЙ
// ======================================================

async function firebaseGet(path) {

  return await firebaseRequest(
    path,
    {
      method: "GET",
    }
  );
}

// ======================================================
// START
// ======================================================

bot.start(async (ctx) => {

  sessions.delete(ctx.from.id);

  await ctx.reply(
    "📸 Добро пожаловать в СТИ ФотоБот!\n\n" +

    "Здесь ты можешь отправлять фотографии " +
    "для фотоархива «Объектив техникума».\n\n" +

    "📷 Опубликовать фотографию\n" +
    "🖼️ Посмотреть свои публикации\n\n" +

    "Выбирай действие:",
    
    mainKeyboard()
  );
});

// ======================================================
// PUBLISH
// ======================================================

bot.command("publish", async (ctx) => {

  sessions.set(
    ctx.from.id,
    {
      step: "photo",
    }
  );

  await ctx.reply(
    "📷 Отправь мне фотографию."
  );
});

// ======================================================
// КНОПКА PUBLISH
// ======================================================

bot.action("publish", async (ctx) => {

  await ctx.answerCbQuery();

  sessions.set(
    ctx.from.id,
    {
      step: "photo",
    }
  );

  await ctx.reply(
    "📷 Отправь мне фотографию."
  );
});

// ======================================================
// ФОТО
// ======================================================

bot.on("photo", async (ctx) => {

  const userId = ctx.from.id;

  const session =
    sessions.get(userId);

  if (
    !session ||
    session.step !== "photo"
  ) {

    await ctx.reply(
      "Сначала нажми «📸 Опубликовать фотографию»."
    );

    return;
  }

  const photos =
    ctx.message.photo;

  const bestPhoto =
    photos[photos.length - 1];

  session.photoFileId =
    bestPhoto.file_id;

  session.step = "title";

  await ctx.reply(
    "✅ Фотография получена!\n\n" +
    "📝 Теперь напиши название фотографии."
  );
});

// ======================================================
// ТЕКСТ
// ======================================================

bot.on("text", async (ctx) => {

  const userId = ctx.from.id;

  const text =
    ctx.message.text.trim();

  const session =
    sessions.get(userId);

  if (!session) {
    return;
  }

  // CANCEL

  if (text === "/cancel") {

    sessions.delete(userId);

    await ctx.reply(
      "❌ Публикация отменена.",
      mainKeyboard()
    );

    return;
  }

  // TITLE

  if (session.step === "title") {

    session.title = text;

    session.step = "category";

    await ctx.reply(
      "📂 Выбери категорию:",
      categoryKeyboard()
    );

    return;
  }

  // AUTHOR

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
// КАТЕГОРИЯ
// ======================================================

bot.action(
  /^category:(.+)$/,
  async (ctx) => {

    await ctx.answerCbQuery();

    const userId =
      ctx.from.id;

    const session =
      sessions.get(userId);

    if (
      !session ||
      session.step !== "category"
    ) {

      await ctx.reply(
        "⚠️ Публикация не найдена.\n\n" +
        "Начни заново: /publish"
      );

      return;
    }

    session.category =
      ctx.match[1];

    session.step = "author";

    await ctx.reply(
      "👤 Напиши имя автора фотографии."
    );
  }
);

// ======================================================
// ПОДТВЕРЖДЕНИЕ
// ======================================================

bot.action(
  "confirm_publish",
  async (ctx) => {

    await ctx.answerCbQuery();

    const userId =
      ctx.from.id;

    const session =
      sessions.get(userId);

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

    // ==================================================
    // ДАННЫЕ ДЛЯ FIREBASE
    // ==================================================

    const publication = {

      title:
        session.title,

      category:
        session.category,

      authorName:
        session.authorName,

      telegramFileId:
        session.photoFileId,

      telegramUserId:
        userId,

      telegramUsername:
        ctx.from.username || null,

      status:
        "published",

      createdAt:
        Date.now(),
    };

    try {

      console.log(
        "Сохраняем публикацию:"
      );

      console.log(
        publication
      );

      const result =
        await firebasePush(
          "photos",
          publication
        );

      console.log(
        "Firebase result:",
        result
      );

      sessions.delete(userId);

      await ctx.editMessageText(
        "✅ Фотография успешно опубликована!\n\n" +

        `📝 ${publication.title}\n` +
        `📂 ${publication.category}\n` +
        `👤 ${publication.authorName}\n\n` +

        "🔥 Данные записаны в Firebase Realtime Database."
      );

    } catch (error) {

      console.error(
        "❌ ОШИБКА FIREBASE:",
        error
      );

      // Показываем ошибку пользователю
      // прямо в Telegram.

      const errorText =
        String(error.message || error);

      await ctx.reply(
        "❌ Firebase не разрешил сохранить фотографию.\n\n" +

        "🔎 Точная ошибка:\n\n" +

        "```text\n" +
        errorText.substring(0, 3500) +
        "\n```",
        
        {
          parse_mode: "Markdown"
        }
      );
    }
  }
);

// ======================================================
// ОТМЕНА
// ======================================================

bot.action(
  "cancel_publish",
  async (ctx) => {

    await ctx.answerCbQuery();

    sessions.delete(
      ctx.from.id
    );

    await ctx.editMessageText(
      "❌ Публикация отменена."
    );

    await ctx.reply(
      "Главное меню:",
      mainKeyboard()
    );
  }
);

// ======================================================
// MY PHOTOS
// ======================================================

bot.command(
  "myphotos",
  async (ctx) => {

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
            item =>
              String(
                item.telegramUserId
              ) ===
              String(
                ctx.from.id
              )
          )
          .sort(
            (a, b) =>
              (b.createdAt || 0) -
              (a.createdAt || 0)
          );

      if (
        publications.length === 0
      ) {

        await ctx.reply(
          "🖼️ У тебя пока нет публикаций."
        );

        return;
      }

      let message =
        `🖼️ Твоих публикаций: ${publications.length}\n\n`;

      publications
        .slice(0, 20)
        .forEach(
          (item, index) => {

            message +=
              `${index + 1}. 📸 ${item.title}\n` +
              `   📂 ${item.category}\n` +
              `   👤 ${item.authorName}\n\n`;
          }
        );

      await ctx.reply(
        message
      );

    } catch (error) {

      console.error(
        error
      );

      await ctx.reply(
        "❌ Не удалось получить публикации.\n\n" +
        `Ошибка: ${error.message}`
      );
    }
  }
);

// ======================================================
// MY PHOTOS BUTTON
// ======================================================

bot.action(
  "myphotos",
  async (ctx) => {

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
            item =>
              String(
                item.telegramUserId
              ) ===
              String(
                ctx.from.id
              )
          );

      if (
        publications.length === 0
      ) {

        await ctx.reply(
          "🖼️ У тебя пока нет публикаций."
        );

        return;
      }

      let message =
        `🖼️ Твоих публикаций: ${publications.length}\n\n`;

      publications
        .slice(0, 20)
        .forEach(
          (item, index) => {

            message +=
              `${index + 1}. 📸 ${item.title}\n` +
              `   📂 ${item.category}\n` +
              `   👤 ${item.authorName}\n\n`;
          }
        );

      await ctx.reply(
        message
      );

    } catch (error) {

      await ctx.reply(
        "❌ Ошибка Firebase:\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// HELP
// ======================================================

bot.command(
  "help",
  async (ctx) => {

    await ctx.reply(
      "❓ Помощь\n\n" +

      "/start — главное меню\n" +
      "/publish — опубликовать фотографию\n" +
      "/myphotos — мои публикации\n" +
      "/cancel — отменить публикацию\n" +
      "/help — помощь"
    );
  }
);

bot.action(
  "help",
  async (ctx) => {

    await ctx.answerCbQuery();

    await ctx.reply(
      "❓ Помощь\n\n" +

      "📸 Опубликовать фотографию — " +
      "загрузить фотографию\n\n" +

      "🖼️ Мои публикации — " +
      "посмотреть свои фотографии\n\n" +

      "/cancel — отменить публикацию"
    );
  }
);

// ======================================================
// ОШИБКИ
// ======================================================

bot.catch(
  (error) => {

    console.error(
      "❌ Ошибка Telegram:",
      error
    );
  }
);

// ======================================================
// HTTP SERVER ДЛЯ RENDER
// ======================================================

const PORT =
  Number(process.env.PORT) || 10000;

const server =
  http.createServer(
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
      `🌐 Server started on port ${PORT}`
    );
  }
);

// ======================================================
// ЗАПУСК TELEGRAM BOT
// ======================================================

bot.launch()
  .then(
    () => {

      console.log(
        "================================"
      );

      console.log(
        "📸 СТИ ФотоБот запущен!"
      );

      console.log(
        "🔥 Firebase:",
        FIREBASE_DATABASE_URL
      );

      console.log(
        "================================"
      );
    }
  )
  .catch(
    (error) => {

      console.error(
        "❌ Ошибка запуска:",
        error
      );

      process.exit(1);
    }
  );

// ======================================================
// ЗАВЕРШЕНИЕ
// ======================================================

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);