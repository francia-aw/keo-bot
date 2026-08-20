require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const Groq = require('groq-sdk');
const fs = require('fs');

// إعداد الذكاء الاصطناعي
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// إعداد البوت
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ملف حفظ الإعدادات
const dbFile = './serverSettings.json';
function loadDB() {
    if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(dbFile));
}
function saveDB(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// لما البوت يشتغل
client.once('ready', () => {
    console.log(`🚀 البوت فاجر وشغال باسم: ${client.user.tag}`);
});

// نظام الترحيب
client.on('guildMemberAdd', async (member) => {
    const db = loadDB();
    const serverConfig = db[member.guild.id];
    
    if (serverConfig && serverConfig.welcomeChannel) {
        const welcomeChannel = member.guild.channels.cache.get(serverConfig.welcomeChannel);
        if (welcomeChannel) {
            welcomeChannel.send(`أهلاً بك يا <@${member.id}> في السيرفر! 🎉 نورتنا.`);
        }
    }
});

// الأوامر النصية (الكنترول بانل وقفل/فتح الشات)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // أوامر الإدارة (للمشرفين فقط)
    if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        
        // لوحة تحكم البوت
        if (message.content === '!setup') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ لوحة تحكم البوت')
                .setDescription('اختار من الزراير اللي تحت عشان تظبط إعدادات البوت في السيرفر ده.')
                .setColor('Blue');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('set_welcome').setLabel('تحديد روم الترحيب').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('set_ticket').setLabel('إنشاء بانل التكتات').setStyle(ButtonStyle.Primary)
            );

            await message.reply({ embeds: [embed], components: [row] });
        }

        // قفل وفتح الشات
        if (message.content === '!lock') {
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
            message.reply('🔒 تم إغلاق الشات بنجاح.');
        }
        if (message.content === '!unlock') {
            await message.channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
            message.reply('🔓 تم فتح الشات بنجاح.');
        }
    }
});

// التعامل مع الزراير والنماذج (Interactions)
client.on('interactionCreate', async (interaction) => {
    const db = loadDB();
    if (!db[interaction.guild.id]) db[interaction.guild.id] = {};

    // 1. تحديد روم الترحيب
    if (interaction.isButton() && interaction.customId === 'set_welcome') {
        db[interaction.guild.id].welcomeChannel = interaction.channel.id;
        saveDB(db);
        await interaction.reply({ content: `✅ تم تعيين هذه الروم (${interaction.channel}) للترحيب بالأعضاء الجدد!`, ephemeral: true });
    }

    // 2. إنشاء بانل التكتات في الروم الحالية
    if (interaction.isButton() && interaction.customId === 'set_ticket') {
        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎫 تذاكر الدعم الفني الذكية')
            .setDescription('اضغط على الزر بالأسفل لفتح تذكرة وشرح مشكلتك لمساعدنا الذكي.')
            .setColor('DarkButNotBlack');

        const ticketBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket').setLabel('افتح تذكرة 📩').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [ticketEmbed], components: [ticketBtn] });
        await interaction.reply({ content: '✅ تم إنشاء لوحة التكتات بنجاح!', ephemeral: true });
    }

    // 3. لما شخص عادي يدوس "فتح تذكرة"
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
        const modal = new ModalBuilder()
            .setCustomId('ticket_modal')
            .setTitle('اشرح مشكلتك');

        const problemInput = new TextInputBuilder()
            .setCustomId('problem_desc')
            .setLabel('ما هي مشكلتك باختصار؟')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(problemInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
    }

    // 4. بعد ما الشخص يكتب مشكلته ويبعتها
    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
        const problem = interaction.fields.getTextInputValue('problem_desc');
        
        // إنشاء روم خاصة للتذكرة
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        await interaction.reply({ content: `✅ تم فتح التذكرة بنجاح: ${ticketChannel}`, ephemeral: true });
        
        const initMessage = await ticketChannel.send(`أهلاً بك <@${interaction.user.id}>!\n**مشكلتك:** ${problem}\n\n🤖 *جاري التفكير في حل عبر الذكاء الاصطناعي...*`);

        // الاتصال بـ Groq AI
        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'أنت مساعد دعم فني محترف في سيرفر ديسكورد. ردودك يجب أن تكون دقيقة ومختصرة وباللغة العربية. استخدم بيانات السيرفر لمساعدة المستخدم.' },
                    { role: 'user', content: problem }
                ],
                model: 'llama3-8b-8192',
            });
            
            const aiResponse = chatCompletion.choices[0]?.message?.content || 'عذراً، لم أتمكن من إيجاد حل في الوقت الحالي. برجاء انتظار أحد المشرفين.';
            
            const aiEmbed = new EmbedBuilder()
                .setTitle('💡 رد المساعد الذكي')
                .setDescription(aiResponse)
                .setColor('Green');

            await ticketChannel.send({ embeds: [aiEmbed] });
        } catch (error) {
            console.error('Groq Error:', error);
            await ticketChannel.send('⚠️ حدث خطأ أثناء الاتصال بالذكاء الاصطناعي. المشرفين هيراجعوا مشكلتك قريباً.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
