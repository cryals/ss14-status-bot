const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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

// Путь к файлу для сохранения сообщений
const STORAGE_PATH = path.join(__dirname, 'status_messages.json');

// Форматирование времени в 24-часовом формате по МСК (UTC+3)
function formatTime(date) {
    // Создаем новый объект даты с учетом московского времени (UTC+3)
    const options = {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour12: false, // 24-часовой формат
        timeZone: 'Europe/Moscow'
    };
    
    // Форматируем дату с использованием Intl API
    const formatted = new Intl.DateTimeFormat('ru-RU', options).format(date);
    
    // Разделяем на время и дату
    const [datePart, timePart] = formatted.split(', ');
    
    // Возвращаем в нужном формате: "ЧЧ:ММ ДД.ММ.ГГГГ"
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
        const response = await fetch('http://85.192.49.3:1212/status');
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
        .setDescription(`**Онлайн:** ${data.players}\n**Карта:** ${data.map}\n**Раунд:** ${data.round_id}\n**Режим:** ${data.preset}\n**Время от начала смены:** ${roundTime}`)
        .setColor(14745344)
        .setAuthor({ 
            name: data.name, 
            iconURL: 'https://i.postimg.cc/SRSb1YGh/123123.png'.trim() 
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

// Функция обновления сообщений
async function updateStatusMessages() {
    const data = await fetchServerStatus();
    const embed = createStatusEmbed(data);
    
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
                        channel_types: [0, 5] // Только текстовые каналы
                    }
                ]
            }
        ]);
        console.log('Слеш-команды зарегистрированы');
    } catch (error) {
        console.error('Ошибка регистрации команд:', error);
    }
    
    // Запуск периодического обновления
    await updateStatusMessages(); // Обновить сразу после запуска
    setInterval(updateStatusMessages, 60000); // Обновление каждые 60 секунд
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