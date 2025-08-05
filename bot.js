/**
 * © 2025 AL-S. All Rights Reserved.
 * Author: AL-S <als@stopco.ru>
 * For licensing: als@stopco.ru
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
// Для Node.js < 18 используем node-fetch@2
const fetch = require('node-fetch');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Функция для форматирования времени
function formatTime(date) {
    return `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')} ` +
           `${date.getUTCDate().toString().padStart(2, '0')}.${(date.getUTCMonth() + 1).toString().padStart(2, '0')}.${date.getUTCFullYear()}`;
}

// Функция для расчета времени с начала раунда
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
            .setTitle('Ошибка')
            .setDescription('Не удалось получить данные сервера. Проверьте подключение.')
            .setColor(0xFF0000)
            .setFooter({ text: `Обновлено ${formatTime(new Date())}` });
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
            text: `Обновлено ${formatTime(new Date())}` 
        });
}

client.once('ready', async () => {
    console.log(`Бот запущен как ${client.user.tag}!`);
    
    try {
        // Регистрация слеш-команды
        await client.application.commands.set([
            {
                name: 'status',
                description: 'Показать статус сервера'
            }
        ]);
        console.log('Слеш-команда /status зарегистрирована');
    } catch (error) {
        console.error('Ошибка регистрации команды:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === 'status') {
        await interaction.deferReply();
        
        // Получаем начальные данные
        const initialData = await fetchServerStatus();
        const embed = createStatusEmbed(initialData);
        
        // Отправляем сообщение
        const message = await interaction.editReply({ 
            embeds: [embed] 
        });
        
        // Устанавливаем интервал для обновления сообщения каждые 2 секунды
        const interval = setInterval(async () => {
            const data = await fetchServerStatus();
            const newEmbed = createStatusEmbed(data);
            
            try {
                await message.edit({ 
                    embeds: [newEmbed] 
                });
            } catch (error) {
                console.error('Ошибка обновления сообщения:', error);
                clearInterval(interval);
            }
        }, 2000);
    }
});

// Запуск бота
client.login(process.env.DISCORD_TOKEN);