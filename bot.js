const { Telegraf, Markup } = require("telegraf");
const http = require("http");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("ERROR: BOT_TOKEN environment variable is not set.");
  process.exit(1);
}

const bot = new Telegraf(token);

// Temporary conversation state.
// This is intentionally in memory for the first test.
// Firebase will replace this storage later.
const sessions = new Map();

const categories = [
  ["🏫 Техникум", "tech"],
  ["🧑‍🎓 Студенты", "students"],
  ["🌳 Прогулки", "walks"],
  ["🏆 Спорт", "sport"],
  ["🎨 Творчество", "creative"],
  ["😂 Смешные фото", "funny"],
  ["📷 Другое", "other"]
];

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📸 Опубликовать фотографию", "publish")],
    [
      Markup.button.callback("🖼️ Мои публикации", "myphotos"),
      Markup.button.callback("ℹ️ Помощь", "help")
    ]
  ]);
}

function categoryKeyboard() {
  return Markup.inlineKeyboard(
    categories.map(([label, value]) => [
      Markup.button.callback(label, `cat:${value}`)
    ])
  );
}

function categoryName(value) {
  const found = categories.find(([, v]) => v === value);
  return found ? found[0] : value;
}

function resetSession(userId) {
  sessions.delete(userId);
}

bot.start(async (ctx) => {
  resetSession(ctx.from.id);

  await ctx.reply(
    `📸 Добро пожаловать в СТИ ФотоБот!

Здесь ты можешь отправить фотографию и поделиться ею через фотоархив «Объектив техникума».

Что можно сделать:
📷 Опубликовать фотографию
🖼️ Посмотреть свои публикации
👤 Указать имя автора
📚 Выбрать категорию

Каждый кадр — часть истории нашего техникума. ❤️`,
    mainKeyboard()
  );
});

bot.command("publish", async (ctx) => {
  startPublish(ctx);
});

async function startPublish(ctx) {
  sessions.set(ctx.from.id, { step: "photo" });

  await ctx.reply(
    "📷 Отлично!\n\nОтправь мне фотографию, которую хочешь опубликовать.\n\nДля отмены напиши /cancel"
  );
}

bot.command("cancel", async (ctx) => {
  resetSession(ctx.from.id);
  await ctx.reply("❌ Публикация отменена.", mainKeyboard());
});

bot.command("myphotos", async (ctx) => {
  await ctx.reply(
    "🖼️ Раздел «Мои публикации» пока работает в тестовом режиме.\n\nПосле подключения Firebase здесь появится список твоих опубликованных фотографий.",
    mainKeyboard()
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `ℹ️ Помощь

📸 /publish — опубликовать фотографию
🖼️ /myphotos — мои публикации
❌ /cancel — отменить текущую публикацию
ℹ️ /help — помощь

Сейчас бот работает в тестовом режиме. Firebase подключим следующим этапом.`,
    mainKeyboard()
  );
});

bot.action("publish", async (ctx) => {
  await ctx.answerCbQuery();
  await startPublish(ctx);
});

bot.action("myphotos", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "🖼️ Пока здесь нет сохранённых публикаций.\n\nFirebase подключим следующим этапом.",
    mainKeyboard()
  );
});

bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "ℹ️ Отправь /publish или нажми «📸 Опубликовать фотографию», затем следуй подсказкам.",
    mainKeyboard()
  );
});

bot.on("photo", async (ctx) => {
  const session = sessions.get(ctx.from.id);

  if (!session || session.step !== "photo") {
    await ctx.reply(
      "📸 Чтобы начать публикацию, нажми кнопку ниже.",
      mainKeyboard()
    );
    return;
  }

  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];

  session.photoFileId = best.file_id;
  session.step = "title";
  sessions.set(ctx.from.id, session);

  await ctx.reply(
    "✅ Фото получил!\n\nТеперь напиши название фотографии.\n\nНапример: «Прогулка возле техникума»"
  );
});

bot.on("text", async (ctx) => {
  const session = sessions.get(ctx.from.id);

  if (!session) {
    await ctx.reply(
      "Привет! 👋 Выбери действие:",
      mainKeyboard()
    );
    return;
  }

  if (ctx.message.text.startsWith("/")) return;

  if (session.step === "title") {
    session.title = ctx.message.text.trim();

    if (!session.title) {
      await ctx.reply("⚠️ Название не может быть пустым. Напиши название ещё раз.");
      return;
    }

    session.step = "category";
    sessions.set(ctx.from.id, session);

    await ctx.reply(
      "📚 Выбери категорию:",
      categoryKeyboard()
    );
    return;
  }

  if (session.step === "author") {
    session.authorName = ctx.message.text.trim();

    if (!session.authorName) {
      await ctx.reply("⚠️ Имя автора не может быть пустым. Напиши его ещё раз.");
      return;
    }

    session.step = "confirm";
    sessions.set(ctx.from.id, session);

    await ctx.reply(
      `📸 Готово к публикации!

Название: ${session.title}
Категория: ${categoryName(session.category)}
Автор: ${session.authorName}

В тестовом режиме после нажатия «Опубликовать» бот просто подтвердит публикацию. Firebase подключим следующим этапом.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Опубликовать", "confirm_publish"),
          Markup.button.callback("❌ Отмена", "cancel_publish")
        ]
      ])
    );
  }
});

bot.action(/^cat:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const session = sessions.get(ctx.from.id);

  if (!session || session.step !== "category") {
    await ctx.reply("Начни новую публикацию через /publish.", mainKeyboard());
    return;
  }

  session.category = ctx.match[1];
  session.step = "author";
  sessions.set(ctx.from.id, session);

  await ctx.reply(
    "👤 Теперь напиши имя автора фотографии.\n\nНапример: Артур"
  );
});

bot.action("confirm_publish", async (ctx) => {
  await ctx.answerCbQuery("Публикация принята!");

  const session = sessions.get(ctx.from.id);

  if (!session || session.step !== "confirm") {
    await ctx.reply("Эта публикация уже обработана. Начни новую через /publish.");
    return;
  }

  await ctx.reply(
    `🎉 Публикация принята!

📸 ${session.title}
📚 ${categoryName(session.category)}
👤 ${session.authorName}

Сейчас это тестовый режим: данные ещё не записываются в Firebase.
Следующим этапом подключим Firebase Storage + Firestore.`,
    mainKeyboard()
  );

  resetSession(ctx.from.id);
});

bot.action("cancel_publish", async (ctx) => {
  await ctx.answerCbQuery();
  resetSession(ctx.from.id);
  await ctx.reply("❌ Публикация отменена.", mainKeyboard());
});

// Small HTTP server so Render can run this as a Web Service.
const port = Number(process.env.PORT || 10000);

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("СТИ ФотоБот работает ✅");
}).listen(port, "0.0.0.0", () => {
  console.log(`HTTP server listening on port ${port}`);
});

bot.launch()
  .then(() => console.log("Telegram bot started successfully."))
  .catch((err) => {
    console.error("Failed to start Telegram bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
