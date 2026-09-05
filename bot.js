const { Telegraf, Markup } = require("telegraf");
const http = require("http");

// ======================================================
// НАСТРОЙКИ
// ======================================================

const BOT_TOKEN = process.env.BOT_TOKEN;

const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  "https://stisait-23039-default-rtdb.firebaseio.com";

const ADMIN_TELEGRAM_ID =
  process.env.ADMIN_TELEGRAM_ID || "";

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

  const url =
    `${baseUrl}/${path}.json`;

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

    console.log(
      "Firebase status:",
      response.status
    );

    console.log(
      "Firebase response:",
      text
    );

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
// FIREBASE PUSH
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
// FIREBASE GET
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
// FIREBASE DELETE
// ======================================================

async function firebaseDelete(path) {
  return await firebaseRequest(
    path,
    {
      method: "DELETE",
    }
  );
}

// ======================================================
// ПРОВЕРКА АДМИНИСТРАТОРА
// ======================================================

function isAdmin(userId) {
  if (!ADMIN_TELEGRAM_ID) {
    return false;
  }

  return String(userId) ===
    String(ADMIN_TELEGRAM_ID);
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
    "🖼️ Посмотреть свои публикации\n" +
    "🗑️ Удалять свои публикации\n\n" +

    "Выбирай действие:",
    mainKeyboard()
  );
});

// ======================================================
// PUBLISH COMMAND
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
// PUBLISH BUTTON
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
  const userId =
    ctx.from.id;

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

  session.step =
    "title";

  await ctx.reply(
    "✅ Фотография получена!\n\n" +
    "📝 Теперь напиши название фотографии."
  );
});

// ======================================================
// ТЕКСТ
// ======================================================

bot.on("text", async (ctx) => {
  const userId =
    ctx.from.id;

  const text =
    ctx.message.text.trim();

  const session =
    sessions.get(userId);

  if (!session) {
    return;
  }

  // ====================================================
  // CANCEL
  // ====================================================

  if (text === "/cancel") {
    sessions.delete(userId);

    await ctx.reply(
      "❌ Публикация отменена.",
      mainKeyboard()
    );

    return;
  }

  // ====================================================
  // TITLE
  // ====================================================

  if (session.step === "title") {
    session.title =
      text.substring(0, 200);

    session.step =
      "category";

    await ctx.reply(
      "📂 Выбери категорию:",
      categoryKeyboard()
    );

    return;
  }

  // ====================================================
  // AUTHOR
  // ====================================================

  if (session.step === "author") {
    session.authorName =
      text.substring(0, 100);

    session.step =
      "confirmation";

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

    session.step =
      "author";

    await ctx.reply(
      "👤 Напиши имя автора фотографии."
    );
  }
);

// ======================================================
// ПОДТВЕРЖДЕНИЕ ПУБЛИКАЦИИ
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

      sessions.delete(
        userId
      );

      await ctx.editMessageText(
        "✅ Фотография успешно опубликована!\n\n" +

        `📝 ${publication.title}\n` +
        `📂 ${publication.category}\n` +
        `👤 ${publication.authorName}\n\n` +

        "🌐 Фотография появится на сайте автоматически."
      );

    } catch (error) {
      console.error(
        "❌ ОШИБКА FIREBASE:",
        error
      );

      const errorText =
        String(
          error.message || error
        );

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
// ОТМЕНА ПУБЛИКАЦИИ
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
// ПОЛУЧИТЬ ПУБЛИКАЦИИ ПОЛЬЗОВАТЕЛЯ
// ======================================================

async function getUserPublications(userId) {
  const data =
    await firebaseGet("photos");

  if (!data) {
    return [];
  }

  return Object.entries(data)
    .map(
      ([id, item]) => ({
        id,
        ...(item || {})
      })
    )
    .filter(
      item =>
        String(
          item.telegramUserId
        ) ===
        String(userId)
    )
    .sort(
      (a, b) =>
        Number(
          b.createdAt || 0
        ) -
        Number(
          a.createdAt || 0
        )
    );
}

// ======================================================
// КНОПКА МОИ ПУБЛИКАЦИИ
// ======================================================

async function showMyPhotos(ctx) {
  try {
    const publications =
      await getUserPublications(
        ctx.from.id
      );

    if (
      publications.length === 0
    ) {
      await ctx.reply(
        "🖼️ У тебя пока нет публикаций."
      );

      return;
    }

    await ctx.reply(
      `🖼️ Твои публикации: ${publications.length}\n\n` +
      "Выбери фотографию:",

      Markup.inlineKeyboard(
        publications
          .slice(0, 30)
          .map((item, index) => [
            Markup.button.callback(
              `${index + 1}. 📸 ${item.title || "Без названия"}`,
              `viewphoto:${item.id}`
            )
          ])
      )
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

// ======================================================
// MY PHOTOS COMMAND
// ======================================================

bot.command(
  "myphotos",
  async (ctx) => {
    await showMyPhotos(ctx);
  }
);

// ======================================================
// MY PHOTOS BUTTON
// ======================================================

bot.action(
  "myphotos",
  async (ctx) => {
    await ctx.answerCbQuery();

    await showMyPhotos(ctx);
  }
);

// ======================================================
// ПРОСМОТР ФОТОГРАФИИ
// ======================================================

bot.action(
  /^viewphoto:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const photoId =
      ctx.match[1];

    try {
      const photo =
        await firebaseGet(
          `photos/${encodeURIComponent(photoId)}`
        );

      if (!photo) {
        await ctx.reply(
          "❌ Эта фотография уже удалена."
        );

        return;
      }

      const owner =
        String(
          photo.telegramUserId
        ) ===
        String(
          ctx.from.id
        );

      const admin =
        isAdmin(
          ctx.from.id
        );

      if (!owner && !admin) {
        await ctx.reply(
          "❌ У тебя нет доступа к этой публикации."
        );

        return;
      }

      // ВАЖНО:
      // Используем ID записи Firebase,
      // а не Telegram file_id.

      const imageUrl =
        `${getPublicBaseUrl()}/photo/${encodeURIComponent(photoId)}`;

      const buttons = [
        [
          Markup.button.callback(
            "🗑️ Удалить фотографию",
            `deletephoto:${photoId}`
          )
        ],
        [
          Markup.button.callback(
            "⬅️ Назад",
            "myphotos"
          )
        ]
      ];

      await ctx.replyWithPhoto(
        {
          url: imageUrl
        },
        {
          caption:
            "📸 " +
            (photo.title || "Без названия") +
            "\n\n" +

            "📂 " +
            (photo.category || "Другое") +
            "\n" +

            "👤 " +
            (photo.authorName || "Автор не указан"),

          ...Markup.inlineKeyboard(
            buttons
          )
        }
      );

    } catch (error) {
      console.error(
        "VIEW PHOTO ERROR:",
        error
      );

      await ctx.reply(
        "❌ Не удалось открыть фотографию.\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ
// ======================================================

bot.action(
  /^deletephoto:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const photoId =
      ctx.match[1];

    try {
      const photo =
        await firebaseGet(
          `photos/${encodeURIComponent(photoId)}`
        );

      if (!photo) {
        await ctx.reply(
          "❌ Фотография уже удалена."
        );

        return;
      }

      const owner =
        String(
          photo.telegramUserId
        ) ===
        String(
          ctx.from.id
        );

      const admin =
        isAdmin(
          ctx.from.id
        );

      if (!owner && !admin) {
        await ctx.reply(
          "❌ Ты не можешь удалить эту фотографию."
        );

        return;
      }

      await ctx.reply(
        "⚠️ Удалить фотографию?\n\n" +

        `📸 ${photo.title || "Без названия"}\n` +
        `📂 ${photo.category || "Другое"}\n\n` +

        "После удаления она исчезнет из фотоархива " +
        "и больше не будет отображаться на сайте.",

        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "🗑️ Да, удалить",
              `confirmdelete:${photoId}`
            )
          ],
          [
            Markup.button.callback(
              "❌ Отмена",
              `canceldelete:${photoId}`
            )
          ]
        ])
      );

    } catch (error) {
      console.error(
        "DELETE CONFIRM ERROR:",
        error
      );

      await ctx.reply(
        "❌ Ошибка:\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ
// ======================================================

bot.action(
  /^confirmdelete:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery(
      "Удаляем..."
    );

    const photoId =
      ctx.match[1];

    try {
      const photo =
        await firebaseGet(
          `photos/${encodeURIComponent(photoId)}`
        );

      if (!photo) {
        await ctx.editMessageText(
          "❌ Фотография уже была удалена."
        );

        return;
      }

      const owner =
        String(
          photo.telegramUserId
        ) ===
        String(
          ctx.from.id
        );

      const admin =
        isAdmin(
          ctx.from.id
        );

      if (!owner && !admin) {
        await ctx.editMessageText(
          "❌ У тебя нет прав на удаление этой фотографии."
        );

        return;
      }

      await firebaseDelete(
        `photos/${encodeURIComponent(photoId)}`
      );

      await ctx.editMessageText(
        "🗑️ Фотография удалена.\n\n" +
        "Она больше не будет отображаться " +
        "в фотоархиве на сайте."
      );

    } catch (error) {
      console.error(
        "DELETE ERROR:",
        error
      );

      await ctx.reply(
        "❌ Не удалось удалить фотографию.\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// ОТМЕНА УДАЛЕНИЯ
// ======================================================

bot.action(
  /^canceldelete:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      "↩️ Удаление отменено."
    );
  }
);

// ======================================================
// АДМИН: ВСЕ ФОТОГРАФИИ
// ======================================================

bot.command(
  "admin",
  async (ctx) => {
    if (
      !isAdmin(
        ctx.from.id
      )
    ) {
      await ctx.reply(
        "⛔ У тебя нет доступа к админ-панели."
      );

      return;
    }

    try {
      const data =
        await firebaseGet(
          "photos"
        );

      if (!data) {
        await ctx.reply(
          "📭 В архиве пока нет фотографий."
        );

        return;
      }

      const publications =
        Object.entries(data)
          .map(
            ([id, item]) => ({
              id,
              ...(item || {})
            })
          )
          .sort(
            (a, b) =>
              Number(
                b.createdAt || 0
              ) -
              Number(
                a.createdAt || 0
              )
          );

      await ctx.reply(
        `👑 Админ-панель\n\n` +
        `📸 Фотографий: ${publications.length}\n\n` +
        "Выбери фотографию для управления:",

        Markup.inlineKeyboard(
          publications
            .slice(0, 50)
            .map(
              (item, index) => [
                Markup.button.callback(
                  `${index + 1}. ${item.title || "Без названия"}`,
                  `adminphoto:${item.id}`
                )
              ]
            )
        )
      );

    } catch (error) {
      await ctx.reply(
        "❌ Ошибка админ-панели:\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// АДМИН: ПРОСМОТР
// ======================================================

bot.action(
  /^adminphoto:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    if (
      !isAdmin(
        ctx.from.id
      )
    ) {
      await ctx.reply(
        "⛔ Нет доступа."
      );

      return;
    }

    const photoId =
      ctx.match[1];

    try {
      const photo =
        await firebaseGet(
          `photos/${encodeURIComponent(photoId)}`
        );

      if (!photo) {
        await ctx.reply(
          "❌ Фотография не найдена."
        );

        return;
      }

      // ВАЖНО:
      // Здесь тоже используем Firebase ID.

      const imageUrl =
        `${getPublicBaseUrl()}/photo/${encodeURIComponent(photoId)}`;

      await ctx.replyWithPhoto(
        {
          url: imageUrl
        },
        {
          caption:
            "👑 АДМИН-ПАНЕЛЬ\n\n" +

            `📸 ${photo.title || "Без названия"}\n` +
            `📂 ${photo.category || "Другое"}\n` +
            `👤 ${photo.authorName || "Не указан"}\n` +
            `🆔 ${photo.telegramUserId}`,

          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🗑️ Удалить",
                `deletephoto:${photoId}`
              )
            ],
            [
              Markup.button.callback(
                "⬅️ Назад",
                "admin_back"
              )
            ]
          ])
        }
      );

    } catch (error) {
      await ctx.reply(
        "❌ Ошибка:\n\n" +
        error.message
      );
    }
  }
);

// ======================================================
// АДМИН НАЗАД
// ======================================================

bot.action(
  "admin_back",
  async (ctx) => {
    await ctx.answerCbQuery();

    await ctx.reply(
      "👑 Для открытия админ-панели используй /admin"
    );
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
      "/admin — админ-панель\n" +
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
      "загрузить фотографию.\n\n" +

      "🖼️ Мои публикации — " +
      "посмотреть свои фотографии.\n\n" +

      "🗑️ Удаление — " +
      "можно удалить свою фотографию.\n\n" +

      "👑 Администратор может удалять любые фотографии.\n\n" +

      "/cancel — отменить публикацию."
    );
  }
);

// ======================================================
// PUBLIC URL
// ======================================================

function getPublicBaseUrl() {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL
      .replace(/\/$/, "");
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL
      .replace(/\/$/, "");
  }

  return (
    "http://localhost:" +
    (
      Number(process.env.PORT) ||
      10000
    )
  );
}

// ======================================================
// ПОЛУЧЕНИЕ TELEGRAM FILE URL
// ======================================================

async function getTelegramFileUrl(fileId) {
  if (!fileId) {
    throw new Error(
      "telegramFileId отсутствует"
    );
  }

  const apiUrl =
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;

  const response =
    await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(
      `Telegram getFile HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data.ok ||
    !data.result ||
    !data.result.file_path
  ) {
    throw new Error(
      "Telegram не вернул file_path"
    );
  }

  return (
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`
  );
}

// ======================================================
// ПОЛУЧЕНИЕ ФОТО ПО FIREBASE ID
// ======================================================

async function getPhotoById(photoId) {
  if (!photoId) {
    return null;
  }

  const photo =
    await firebaseGet(
      `photos/${encodeURIComponent(photoId)}`
    );

  return photo;
}

// ======================================================
// HTTP SERVER
// ======================================================

const PORT =
  Number(process.env.PORT) ||
  10000;

const server =
  http.createServer(
    async (req, res) => {

      try {

        const requestUrl =
          new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
          );

        const pathname =
          requestUrl.pathname;

        // ==================================================
        // HEALTH CHECK
        // ==================================================

        if (
          pathname === "/" ||
          pathname === "/health"
        ) {
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

          return;
        }

        // ==================================================
        // ФОТО PROXY
        //
        // /photo/FIREBASE_ID
        //
        // Например:
        // /photo/-P0lelUWhEQR-0HdmbyD
        // ==================================================

        if (
          pathname.startsWith(
            "/photo/"
          )
        ) {

          const photoId =
            decodeURIComponent(
              pathname.substring(
                "/photo/".length
              )
            );

          if (!photoId) {
            res.writeHead(
              400,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            res.end(
              "Firebase photo ID отсутствует"
            );

            return;
          }

          console.log(
            "================================"
          );

          console.log(
            "📸 PHOTO PROXY"
          );

          console.log(
            "Firebase ID:",
            photoId
          );

          // ================================================
          // 1. Получаем запись из Firebase
          // ================================================

          const photo =
            await getPhotoById(
              photoId
            );

          if (!photo) {
            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            res.end(
              "Фотография не найдена"
            );

            return;
          }

          // ================================================
          // Проверяем публикацию
          // ================================================

          if (
            photo.status &&
            photo.status !== "published"
          ) {
            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            res.end(
              "Фотография недоступна"
            );

            return;
          }

          // ================================================
          // 2. Получаем Telegram file_id
          // ================================================

          const fileId =
            photo.telegramFileId;

          if (!fileId) {
            res.writeHead(
              404,
              {
                "Content-Type":
                  "text/plain; charset=utf-8"
              }
            );

            res.end(
              "telegramFileId отсутствует"
            );

            return;
          }

          console.log(
            "Telegram file_id найден"
          );

          // ================================================
          // 3. Получаем Telegram file_path
          // ================================================

          const telegramUrl =
            await getTelegramFileUrl(
              fileId
            );

          console.log(
            "Telegram file URL получен"
          );

          // ================================================
          // 4. Загружаем изображение
          // ================================================

          const imageResponse =
            await fetch(
              telegramUrl
            );

          if (
            !imageResponse.ok
          ) {
            throw new Error(
              `Telegram image HTTP ${imageResponse.status}`
            );
          }

          const contentType =
            imageResponse.headers.get(
              "content-type"
            ) ||
            "image/jpeg";

          const buffer =
            Buffer.from(
              await imageResponse.arrayBuffer()
            );

          // ================================================
          // 5. Отдаём изображение сайту
          // ================================================

          res.writeHead(
            200,
            {
              "Content-Type":
                contentType,

              "Content-Length":
                buffer.length,

              "Cache-Control":
                "public, max-age=86400",

              "Access-Control-Allow-Origin":
                "*",

              "Access-Control-Allow-Methods":
                "GET, OPTIONS",

              "Access-Control-Allow-Headers":
                "Content-Type",
            }
          );

          res.end(
            buffer
          );

          console.log(
            "✅ Фото успешно отдано сайту"
          );

          console.log(
            "================================"
          );

          return;
        }

        // ==================================================
        // OPTIONS
        // ==================================================

        if (
          req.method === "OPTIONS"
        ) {
          res.writeHead(
            204,
            {
              "Access-Control-Allow-Origin":
                "*",

              "Access-Control-Allow-Methods":
                "GET, OPTIONS",

              "Access-Control-Allow-Headers":
                "Content-Type",
            }
          );

          res.end();

          return;
        }

        // ==================================================
        // 404
        // ==================================================

        res.writeHead(
          404,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
          }
        );

        res.end(
          "404 Not Found"
        );

      } catch (error) {

        console.error(
          "================================"
        );

        console.error(
          "❌ HTTP ERROR:"
        );

        console.error(
          error
        );

        console.error(
          "================================"
        );

        if (!res.headersSent) {
          res.writeHead(
            500,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );
        }

        res.end(
          "Ошибка загрузки фотографии"
        );
      }
    }
  );

// ======================================================
// SERVER START
// ======================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================"
    );

    console.log(
      `🌐 Server started on port ${PORT}`
    );

    console.log(
      `📸 Photo proxy: /photo/:photoId`
    );

    console.log(
      "🔥 Firebase:",
      FIREBASE_DATABASE_URL
    );

    console.log(
      "================================"
    );
  }
);

// ======================================================
// TELEGRAM BOT START
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
        "👑 Admin:",
        ADMIN_TELEGRAM_ID
          ? "настроен"
          : "не настроен"
      );

      console.log(
        "🌐 Public URL:",
        getPublicBaseUrl()
      );

      console.log(
        "📸 Photo proxy:",
        `${getPublicBaseUrl()}/photo/:photoId`
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
// SHUTDOWN
// ======================================================

process.once(
  "SIGINT",
  () => bot.stop("SIGINT")
);

process.once(
  "SIGTERM",
  () => bot.stop("SIGTERM")
);