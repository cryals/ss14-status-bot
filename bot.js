const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Конфигурация с значениями по умолчанию
const STORAGE_PATH = path.resolve(process.env.STORAGE_PATH || './status_messages.json');
const SERVER_STATUS_URL = process.env.SERVER_STATUS_URL || 'https://lizard.spacestation14.io/server/status';
const SERVER_ICON_URL = process.env.SERVER_ICON_URL || 'https://raw.githubusercontent.com/cryals/ss14-status-bot/refs/heads/main/ss14_logo.png';
const EMBED_COLOR = parseInt(process.env.EMBED_COLOR, 10) || 14745344;
const UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS, 10) || 60000;

// Форматирование времени в 24-часовом формате по МСК (UTC+3)
function formatTime(date) {
    const options = {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour12: false,
        timeZone: 'Europe/Moscow'
    };

    const formatted = new Intl.DateTimeFormat('ru-RU', options).format(date);
    const [datePart, timePart] = formatted.split(', ');

    return `${timePart} ${datePart}`;
}

// Расчет времени раунда
function calculateRoundTime(startTime) {
    if (!startTime) return "В лобби";

    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;

    if (diffMs < 0) return "0 мин";

    const diffMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    if (hours > 0) {
        return `${hours}ч ${minutes}мин`;
    }
    return `${minutes}мин`;
}

// Получение статуса сервера
async function fetchServerStatus() {
    try {
        const response = await fetch(SERVER_STATUS_URL);
        return await response.json();
    } catch (error) {
        console.error('Ошибка при получении данных:', error);
        return null;
    }
}

// Создание embed сообщения
function createStatusEmbed(data) {
    if (!data) {
        return new EmbedBuilder()
            .setTitle('❌ Ошибка подключения')
            .setDescription('Не удалось получить данные сервера. Проверьте подключение.')
            .setColor(0xFF0000)
            .setFooter({ text: `Обновлено: ${formatTime(new Date())}` });
    }
    const roundTime = calculateRoundTime(data.round_start_time);

    return new EmbedBuilder()
        .setDescription(`**Онлайн:** ${data.players}\n**Карта:** ${data.map || 'Неизвестно'}\n**Раунд:** ${data.round_id}\n**Режим:** ${data.preset}\n**Время от начала смены:** ${roundTime}`)
        .setColor(EMBED_COLOR)
        .setAuthor({
            name: data.name,
            iconURL: SERVER_ICON_URL.trim()
        })
        .setFooter({
            text: `Обновлено: ${formatTime(new Date())}`
        });
}

// Загрузка сохраненных сообщений
async function loadStatusMessages() {
    try {
        const data = await fs.readFile(STORAGE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Файл сообщений не найден, будет создан новый');
            return [];
        }
        console.error('Ошибка загрузки сообщений:', error);
        return [];
    }
}

// Сохранение сообщений в файл
async function saveStatusMessages(messages) {
    try {
        await fs.writeFile(STORAGE_PATH, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Ошибка сохранения сообщений:', error);
    }
}

// Функция обновления сообщений и статуса бота
async function updateStatusMessages() {
    const data = await fetchServerStatus();
    const embed = createStatusEmbed(data);

    // Обновление статуса бота с отображением онлайн
    try {
        if (data && data.players !== undefined && data.soft_max_players !== undefined) {
            client.user.setPresence({
                activities: [{
                    name: `Онлайн: ${data.players}/${data.soft_max_players}`,
                    type: ActivityType.Custom
                }],
                status: 'online'
            });
            console.log(`Статус бота обновлен: Онлайн: ${data.players}/${data.soft_max_players}`);
        } else {
            client.user.setPresence({
                activities: [{
                    name: 'Статус: Ошибка',
                    type: ActivityType.Custom
                }],
                status: 'dnd'
            });
            console.log('Статус бота: Ошибка получения данных');
        }
    } catch (error) {
        console.error('Ошибка обновления статуса бота:', error);
    }

    try {
        const messages = await loadStatusMessages();

        for (const msg of messages) {
            try {
                const channel = await client.channels.fetch(msg.channelId);
                const message = await channel.messages.fetch(msg.messageId);
                await message.edit({ embeds: [embed] });
            } catch (error) {
                console.error(`Ошибка обновления сообщения ${msg.messageId}:`, error);
                // Удаляем нерабочее сообщение из списка
                const updatedMessages = messages.filter(m =>
                    m.messageId !== msg.messageId || m.channelId !== msg.channelId
                );
                await saveStatusMessages(updatedMessages);
            }
        }
    } catch (error) {
        console.error('Ошибка в updateStatusMessages:', error);
    }
}

client.once('ready', async () => {
    console.log(`Бот запущен как ${client.user.tag}!`);

    // Регистрация команд
    try {
        await client.application.commands.set([
            {
                name: 'ping',
                description: 'Проверка работоспособности бота'
            },
            {
                name: 'status',
                description: 'Показать текущий статус сервера'
            },
            {
                name: 'send-status',
                description: 'Запустить автоматическое обновление статуса в канале',
                options: [
                    {
                        name: 'channel',
                        type: 7,
                        description: 'Канал для отправки статуса',
                        required: true,
                        channel_types: [0, 5]
                    }
                ]
            }
        ]);
        console.log('Слеш-команды зарегистрированы');
    } catch (error) {
        console.error('Ошибка регистрации команд:', error);
    }

    // Запуск периодического обновления
    await updateStatusMessages();
    setInterval(updateStatusMessages, UPDATE_INTERVAL_MS);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // Команда ping
    if (interaction.commandName === 'ping') {
        await interaction.reply({ content: 'Pong! 🏓', ephemeral: true });
        return;
    }

    // Команда единоразового статуса
    if (interaction.commandName === 'status') {
        await interaction.deferReply({ ephemeral: true });

        const data = await fetchServerStatus();
        const embed = createStatusEmbed(data);

        await interaction.editReply({
            embeds: [embed]
        });
    }

    // Команда запуска автообновления
    if (interaction.commandName === 'send-status') {
        await interaction.deferReply({ ephemeral: true });

        // Проверка прав администратора
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply('❌ Эта команда доступна только администраторам!');
        }

        const channel = interaction.options.getChannel('channel');

        try {
            // Проверка прав бота
            const botPermissions = channel.permissionsFor(interaction.guild.members.me);
            if (!botPermissions.has(PermissionFlagsBits.ViewChannel)) {
                return interaction.editReply('❌ У бота нет доступа к этому каналу!');
            }
            if (!botPermissions.has(PermissionFlagsBits.SendMessages)) {
                return interaction.editReply('❌ У бота нет прав отправлять сообщения в этот канал!');
            }
            if (!botPermissions.has(PermissionFlagsBits.EmbedLinks)) {
                return interaction.editReply('❌ У бота нет прав отправлять embed-сообщения!');
            }

            const data = await fetchServerStatus();
            const embed = createStatusEmbed(data);

            const sentMessage = await channel.send({ embeds: [embed] });

            // Сохраняем сообщение в файл
            const messages = await loadStatusMessages();
            messages.push({
                channelId: channel.id,
                messageId: sentMessage.id
            });
            await saveStatusMessages(messages);

            await interaction.editReply(`✅ Автообновление запущено в канале ${channel}!`);
            console.log(`Добавлено автообновление в канал ${channel.name} (ID: ${sentMessage.id})`);
        } catch (error) {
            console.error('Ошибка отправки статуса:', error);
            await interaction.editReply('❌ Произошла ошибка при отправке сообщения!');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);