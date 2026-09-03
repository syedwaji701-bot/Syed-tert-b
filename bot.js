const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const CONFIG = {
    BOT_TOKEN: '8769286971:AAHF3fTf230kcno2ROOv6x9giwslxcoyKgU',
    BOT_NAME: 'GitNexus',
    ADMIN_ID: '8601285274',
    FORCE_CHANNELS: ['@syedtechteam', '@botmaking_channel'],
    DB_FILE: './users.json',
    TEMP_DIR: './temp'
};

if (!fs.existsSync(CONFIG.TEMP_DIR)) fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });

const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });

let users = {};
if (fs.existsSync(CONFIG.DB_FILE)) {
    try { users = JSON.parse(fs.readFileSync(CONFIG.DB_FILE, 'utf8')); } catch (e) { users = {}; }
}
function saveUsers() { fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(users, null, 2)); }

const userStates = {};
function setState(userId, action, data = {}) { userStates[userId] = { action, data, step: 1 }; }
function clearState(userId) { delete userStates[userId]; }
function getState(userId) { return userStates[userId] || null; }

function ibtn(text, callback_data, style = 'primary') { return { text, callback_data, style }; }
function iurlBtn(text, url, style = 'primary') { return { text, url, style }; }
function ikeyboard(rows) { return { inline_keyboard: rows }; }

function rbtn(text) { return { text }; }
function rkeyboard(rows, opts = {}) { return { keyboard: rows, resize_keyboard: true, one_time_keyboard: false, ...opts }; }
function removeKeyboard() { return { remove_keyboard: true }; }

const EMOJIS = {
    repo: '📂', newRepo: '✨', upload: '📤', delete: '🗑️',
    file: '📄', zip: '📦', token: '🔑', settings: '⚙️', help: '❓',
    back: '◀️', home: '🏠', check: '✅', cross: '❌', warning: '⚠️',
    rocket: '🚀', lock: '🔒', unlock: '🔓', github: '🐙', folder: '📁',
    success: '✅', danger: '🔴', primary: '🔵'
};

function escapeHtml(text) {
    if (!text) return '';
    return text.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function safeEdit(chatId, messageId, text, options = {}) {
    try {
        return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'HTML', ...options });
    } catch (e) {
        return await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
    }
}

async function checkForceJoin(userId) {
    for (const channel of CONFIG.FORCE_CHANNELS) {
        try {
            const member = await bot.getChatMember(channel, userId);
            if (!['creator', 'administrator', 'member'].includes(member.status)) return false;
        } catch (e) { return false; }
    }
    return true;
}

async function sendForceJoin(chatId) {
    const text = `${EMOJIS.warning} <b>Welcome to ${escapeHtml(CONFIG.BOT_NAME)}</b> ${EMOJIS.github}\n\nBot use karne ke liye pehle in channels ko join karo:`;
    const buttons = CONFIG.FORCE_CHANNELS.map(ch => [iurlBtn(`${EMOJIS.rocket} Join ${ch}`, `https://t.me/${ch.replace('@', '')}`, 'primary')]);
    buttons.push([ibtn(`${EMOJIS.check} I Have Joined`, 'check_join', 'success')]);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

function getMainMenuKeyboard() {
    return rkeyboard([
        [`${EMOJIS.repo} My Repos`, `${EMOJIS.newRepo} New Repo`],
        [`${EMOJIS.upload} Upload File`, `${EMOJIS.delete} Delete Repo`],
        [`${EMOJIS.file} Delete File`, `${EMOJIS.zip} Upload ZIP`],
        [`${EMOJIS.token} Set Token`, `${EMOJIS.settings} Settings`],
        [`${EMOJIS.help} Help`]
    ]);
}

async function sendMainMenu(chatId, userId, banner = '') {
    const token = users[userId]?.github_token;
    let text = '';
    if (banner) text += banner + '\n\n';
    text += `${EMOJIS.github} <b>${escapeHtml(CONFIG.BOT_NAME)}</b>\n`;
    text += `GitHub ko Telegram se control karo\n\n`;
    if (token) {
        text += `${EMOJIS.lock} Token: <b>Set</b> ✓\n`;
        try {
            const userData = await githubGet(token, '/user');
            text += `👤 Account: <b>${escapeHtml(userData.data.login)}</b>\n`;
            text += `📊 Public: <b>${userData.data.public_repos}</b> | 🔒 Private: <b>${userData.data.total_private_repos || 0}</b>\n`;
        } catch (e) { text += `⚠️ Token invalid hai\n`; }
    } else {
        text += `⚠️ GitHub token set nahi hai\n`;
    }
    text += `\n<i>Button dabao ya message bhejo</i>`;
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
}

async function githubRequest(token, method, endpoint, data = null) {
    try {
        const response = await axios({
            method, url: `https://api.github.com${endpoint}`,
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': CONFIG.BOT_NAME },
            data
        });
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.response?.data?.message || error.message, status: error.response?.status };
    }
}
function githubGet(token, endpoint) { return githubRequest(token, 'GET', endpoint); }
function githubPost(token, endpoint, data) { return githubRequest(token, 'POST', endpoint, data); }
function githubDelete(token, endpoint, data) { return githubRequest(token, 'DELETE', endpoint, data); }
function githubPut(token, endpoint, data) { return githubRequest(token, 'PUT', endpoint, data); }

// ─── /start ───
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    if (!(await checkForceJoin(userId))) return sendForceJoin(chatId);
    await sendMainMenu(chatId, userId);
});

// ─── /cancel ───
bot.onText(/\/cancel/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    clearState(userId);
    await bot.sendMessage(chatId, `${EMOJIS.cross} Action cancelled.`, { parse_mode: 'HTML', reply_markup: getMainMenuKeyboard() });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();
    const data = query.data;
    const msgId = query.message.message_id;
    try { await bot.answerCallbackQuery(query.id); } catch (e) {}

    if (!(await checkForceJoin(userId)) && data !== 'check_join') return sendForceJoin(chatId);

    if (data === 'check_join') {
        if (await checkForceJoin(userId)) {
            await safeEdit(chatId, msgId, `${EMOJIS.success} Shukriya! Ab bot use kar sakte ho.`, { parse_mode: 'HTML' });
            return sendMainMenu(chatId, userId);
        } else {
            return safeEdit(chatId, msgId, `${EMOJIS.cross} Pehle dono channels join karo!`, { parse_mode: 'HTML' });
        }
    }

    if (data === 'remove_token') {
        if (users[userId]) { delete users[userId].github_token; saveUsers(); }
        await safeEdit(chatId, msgId, `${EMOJIS.success} Token remove ho gaya.`, { parse_mode: 'HTML' });
        return sendMainMenu(chatId, userId);
    }

    if (data === 'main_menu') return sendMainMenu(chatId, userId);

    if (data === 'back_menu') {
        return sendMainMenu(chatId, userId);
    }

    if (data.startsWith('delrepo_')) {
        const repoName = data.replace('delrepo_', '');
        const token = users[userId]?.github_token;
        const userResult = await githubGet(token, '/user');
        if (!userResult.success) return safeEdit(chatId, msgId, `${EMOJIS.cross} Error: ${escapeHtml(userResult.error)}`, { parse_mode: 'HTML' });
        const username = userResult.data.login;
        const buttons = [
            [ibtn(`${EMOJIS.cross} Cancel`, 'cancel_delrepo', 'primary'), ibtn(`${EMOJIS.danger} YES DELETE`, `conf_delrepo_${repoName}`, 'danger')]
        ];
        return safeEdit(chatId, msgId, `${EMOJIS.warning} <b>Confirm Deletion</b>\n\nRepo: <b>${escapeHtml(repoName)}</b>\nOwner: <b>${escapeHtml(username)}</b>\n\n⚠️ YE ACTION UNDO NAHI HO SAKTA!`, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
    }

    if (data === 'cancel_delrepo') {
        const token = users[userId]?.github_token;
        const result = await githubGet(token, '/user/repos?sort=updated&per_page=20');
        if (!result.success) return safeEdit(chatId, msgId, `${EMOJIS.cross} Error: ${escapeHtml(result.error)}`, { parse_mode: 'HTML' });
        const repos = result.data;
        if (repos.length === 0) return sendMainMenu(chatId, userId, `${EMOJIS.repo} Koi repo nahi.`);
        let txt = `${EMOJIS.delete} <b>Delete Repository</b>\n\nKonsi repo delete karni hai?\n`;
        const buttons = repos.map(repo => [ibtn(`${EMOJIS.danger} ${repo.name}`, `delrepo_${repo.name}`, 'danger')]);
        buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
        return safeEdit(chatId, msgId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
    }

    if (data.startsWith('conf_delrepo_')) {
        const repoName = data.replace('conf_delrepo_', '');
        const token = users[userId]?.github_token;
        const userResult = await githubGet(token, '/user');
        const username = userResult.data.login;
        const result = await githubDelete(token, `/repos/${username}/${repoName}`);
        const banner = result.success ? `${EMOJIS.success} Repository <b>${escapeHtml(repoName)}</b> delete ho gayi!` : `${EMOJIS.cross} Error: ${escapeHtml(result.error)}`;
        await safeEdit(chatId, msgId, banner, { parse_mode: 'HTML' });
        return sendMainMenu(chatId, userId);
    }

    if (data.startsWith('uprepo_')) {
        const repoName = data.replace('uprepo_', '');
        const state = getState(userId);
        if (!state || state.action !== 'upload_file') return safeEdit(chatId, msgId, `${EMOJIS.warning} Session expire ho gaya. Dobara try karo.`, { parse_mode: 'HTML' });
        state.data.repo = repoName;
        state.step = 2;
        return bot.sendMessage(chatId, `${EMOJIS.folder} <b>Target Folder</b>\n\nKonsi folder mein upload karna hai?\nExamples: <code>src/</code> <code>assets/</code> <code>docs/</code>\nRoot (main) folder ke liye <b>skip</b> likho:`, { parse_mode: 'HTML', reply_markup: rkeyboard([[rbtn('skip')]], { one_time_keyboard: true }) });
    }

    if (data.startsWith('delfrepo_')) {
        const repoName = data.replace('delfrepo_', '');
        const token = users[userId]?.github_token;
        const userResult = await githubGet(token, '/user');
        const username = userResult.data.login;
        setState(userId, 'delete_file', { repo: repoName, owner: username });
        return bot.sendMessage(chatId, `${EMOJIS.file} <b>File Path</b>\n\nFile ka path bhejo jo delete karni hai:\nExample: <code>README.md</code> ya <code>src/main.js</code>`, { parse_mode: 'HTML', reply_markup: removeKeyboard() });
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = msg.text || '';

    if (text.startsWith('/')) return;
    if (!(await checkForceJoin(userId))) return sendForceJoin(chatId);

    const state = getState(userId);

    if (!state) {
        if (text === `${EMOJIS.repo} My Repos`) return handleMyRepos(chatId, userId);
        if (text === `${EMOJIS.newRepo} New Repo`) return handleNewRepo(chatId, userId);
        if (text === `${EMOJIS.upload} Upload File`) return handleUploadFile(chatId, userId);
        if (text === `${EMOJIS.delete} Delete Repo`) return handleDeleteRepo(chatId, userId);
        if (text === `${EMOJIS.file} Delete File`) return handleDeleteFile(chatId, userId);
        if (text === `${EMOJIS.zip} Upload ZIP`) return handleUploadZip(chatId, userId);
        if (text === `${EMOJIS.token} Set Token`) return handleSetToken(chatId, userId);
        if (text === `${EMOJIS.settings} Settings`) return handleSettings(chatId, userId);
        if (text === `${EMOJIS.help} Help`) return handleHelp(chatId, userId);
        return;
    }

    if (state.action === 'set_token') {
        const token = text.trim();
        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            return bot.sendMessage(chatId, `${EMOJIS.cross} Invalid token! Token <code>ghp_</code> se start hona chahiye.`, { parse_mode: 'HTML' });
        }
        const result = await githubGet(token, '/user');
        if (!result.success) return bot.sendMessage(chatId, `${EMOJIS.cross} Token invalid hai! Error: ${escapeHtml(result.error)}`);
        if (!users[userId]) users[userId] = {};
        users[userId].github_token = token;
        users[userId].github_username = result.data.login;
        saveUsers();
        clearState(userId);
        return sendMainMenu(chatId, userId, `${EMOJIS.success} Token set ho gaya!\nWelcome, <b>${escapeHtml(result.data.login)}</b>!`);
    }

    if (state.action === 'create_repo') {
        const repoName = text.trim().replace(/\s+/g, '-');
        if (!repoName || !/^[a-zA-Z0-9_.-]+$/.test(repoName)) {
            return bot.sendMessage(chatId, `${EMOJIS.cross} Invalid name! Sirf letters, numbers, hyphens, dots, underscores.`);
        }
        const token = users[userId]?.github_token;
        const result = await githubPost(token, '/user/repos', { name: repoName, private: false, auto_init: true });
        clearState(userId);
        const banner = result.success ? `${EMOJIS.success} Repository <b>${escapeHtml(repoName)}</b> ban gayi!` : `${EMOJIS.cross} Error: ${escapeHtml(result.error)}`;
        return sendMainMenu(chatId, userId, banner);
    }

    if (state.action === 'upload_file' && state.step === 2) {
        let targetPath = text.trim();
        if (targetPath === 'root' || targetPath === 'skip' || targetPath === '/' || !targetPath) {
            targetPath = '';
        } else if (!targetPath.endsWith('/')) {
            targetPath += '/';
        }
        state.data.targetPath = targetPath;
        state.step = 3;
        const typeText = state.data.type === 'zip' ? 'ZIP file' : 'file';
        return bot.sendMessage(chatId, `${EMOJIS.upload} Ab <b>${typeText}</b> bhejo jo upload karna hai.\n\n${state.data.type === 'zip' ? 'ZIP auto-extract hoke upload hogi.' : ''}`, { parse_mode: 'HTML', reply_markup: removeKeyboard() });
    }

    if (state.action === 'upload_file' && state.step === 3) {
        return handleFileUpload(chatId, userId, msg, state);
    }

    if (state.action === 'delete_file') {
        const filePath = text.trim();
        const { repo, owner } = state.data;
        const token = users[userId]?.github_token;
        clearState(userId);
        const shaResult = await githubGet(token, `/repos/${owner}/${repo}/contents/${filePath}`);
        if (!shaResult.success) return sendMainMenu(chatId, userId, `${EMOJIS.cross} File nahi mili: ${escapeHtml(shaResult.error)}`);
        const delResult = await githubDelete(token, `/repos/${owner}/${repo}/contents/${filePath}`, { message: `Deleted via ${CONFIG.BOT_NAME}`, sha: shaResult.data.sha });
        const banner = delResult.success ? `${EMOJIS.success} File <b>${escapeHtml(filePath)}</b> delete ho gayi!` : `${EMOJIS.cross} Error: ${escapeHtml(delResult.error)}`;
        return sendMainMenu(chatId, userId, banner);
    }
});

async function handleMyRepos(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    const result = await githubGet(token, '/user/repos?sort=updated&per_page=10');
    if (!result.success) return bot.sendMessage(chatId, `${EMOJIS.cross} Error: ${escapeHtml(result.error)}`, { parse_mode: 'HTML' });
    const repos = result.data;
    if (repos.length === 0) return bot.sendMessage(chatId, `${EMOJIS.repo} Koi repository nahi.`, { parse_mode: 'HTML' });
    let txt = `${EMOJIS.repo} <b>Your Repositories:</b>\n\n`;
    const buttons = [];
    repos.forEach((repo, idx) => {
        const privacy = repo.private ? `${EMOJIS.lock} Private` : `${EMOJIS.unlock} Public`;
        txt += `${idx + 1}. <b>${escapeHtml(repo.name)}</b> (${privacy})\n`;
        txt += `   ⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}\n`;
        buttons.push([iurlBtn(`${EMOJIS.github} ${repo.name}`, repo.html_url, 'primary')]);
    });
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleNewRepo(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    setState(userId, 'create_repo');
    return bot.sendMessage(chatId, `${EMOJIS.newRepo} <b>New Repository</b>\n\nRepository ka naam bhejo:\n(sirf naam, no spaces)\n\n/cancel to cancel`, { parse_mode: 'HTML', reply_markup: removeKeyboard() });
}

async function handleUploadFile(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    const result = await githubGet(token, '/user/repos?sort=updated&per_page=15');
    if (!result.success || !result.data?.length) return bot.sendMessage(chatId, `${EMOJIS.cross} Koi repo nahi mila. Pehle repo banao.`, { parse_mode: 'HTML' });
    setState(userId, 'upload_file', { type: 'single' });
    let txt = `${EMOJIS.upload} <b>File Upload</b>\n\nKonsi repo mein upload karna hai?`;
    const buttons = result.data.map(repo => [ibtn(`${EMOJIS.repo} ${escapeHtml(repo.name)}`, `uprepo_${repo.name}`, 'primary')]);
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleUploadZip(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    const result = await githubGet(token, '/user/repos?sort=updated&per_page=15');
    if (!result.success || !result.data?.length) return bot.sendMessage(chatId, `${EMOJIS.cross} Koi repo nahi mila. Pehle repo banao.`, { parse_mode: 'HTML' });
    setState(userId, 'upload_file', { type: 'zip' });
    let txt = `${EMOJIS.zip} <b>ZIP Upload</b>\n\nKonsi repo mein ZIP extract karke upload karna hai?`;
    const buttons = result.data.map(repo => [ibtn(`${EMOJIS.repo} ${escapeHtml(repo.name)}`, `uprepo_${repo.name}`, 'success')]);
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleDeleteRepo(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    const result = await githubGet(token, '/user/repos?sort=updated&per_page=20');
    if (!result.success) return bot.sendMessage(chatId, `${EMOJIS.cross} Error: ${escapeHtml(result.error)}`, { parse_mode: 'HTML' });
    const repos = result.data;
    if (repos.length === 0) return bot.sendMessage(chatId, `${EMOJIS.repo} Koi repo nahi.`, { parse_mode: 'HTML' });
    let txt = `${EMOJIS.delete} <b>Delete Repository</b>\n\nKonsi repo delete karni hai?\n`;
    const buttons = repos.map(repo => [ibtn(`${EMOJIS.danger} ${repo.name}`, `delrepo_${repo.name}`, 'danger')]);
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleDeleteFile(chatId, userId) {
    const token = users[userId]?.github_token;
    if (!token) return bot.sendMessage(chatId, `${EMOJIS.warning} Pehle token set karo!`, { parse_mode: 'HTML' });
    const result = await githubGet(token, '/user/repos?sort=updated&per_page=15');
    if (!result.success || !result.data?.length) return bot.sendMessage(chatId, `${EMOJIS.cross} Koi repo nahi.`, { parse_mode: 'HTML' });
    setState(userId, 'delete_file');
    let txt = `${EMOJIS.delete} <b>Delete File</b>\n\nKonsi repo se file delete karni hai?`;
    const buttons = result.data.map(repo => [ibtn(`${EMOJIS.repo} ${escapeHtml(repo.name)}`, `delfrepo_${repo.name}`, 'danger')]);
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleSetToken(chatId, userId) {
    setState(userId, 'set_token');
    return bot.sendMessage(chatId, `${EMOJIS.token} <b>GitHub Token Set Karo</b>\n\nApna GitHub Personal Access Token bhejo\nFormat: <code>ghp_xxxxxxxxxxxx</code>\n\n/cancel to cancel\n\nToken yahan se banao: https://github.com/settings/tokens`, { parse_mode: 'HTML', reply_markup: removeKeyboard() });
}

async function handleSettings(chatId, userId) {
    const token = users[userId]?.github_token;
    let txt = `${EMOJIS.settings} <b>Settings</b>\n\n`;
    if (token) {
        txt += `Token: <code>${escapeHtml(token.substring(0, 8))}...</code>\nToken delete karne ke liye neeche dabao:`;
    } else {
        txt += `Koi token set nahi hai.`;
    }
    const buttons = [];
    if (token) buttons.push([ibtn(`${EMOJIS.delete} Remove Token`, 'remove_token', 'danger')]);
    buttons.push([ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]);
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleHelp(chatId, userId) {
    const txt = `${EMOJIS.help} <b>${escapeHtml(CONFIG.BOT_NAME)} Help</b>\n\n<b>1. Token Setup:</b>\nSet Token → GitHub PAT bhejo\n\n<b>2. Repo Management:</b>\n• New Repo → Naam bhejo\n• Delete Repo → List se select karo\n\n<b>3. File Upload:</b>\n• Single File → Direct upload\n• ZIP Upload → Auto extract + upload all files\n\n<b>4. File Delete:</b>\nRepo select → File path bhejo\n\n/cancel - kisi bhi action ko cancel karo`;
    const buttons = [[ibtn(`${EMOJIS.back} Back`, 'back_menu', 'primary')]];
    await bot.sendMessage(chatId, txt, { parse_mode: 'HTML', reply_markup: ikeyboard(buttons) });
}

async function handleFileUpload(chatId, userId, msg, state) {
    const statusMsg = await bot.sendMessage(chatId, `${EMOJIS.rocket} File receive ho rahi hai...`);

    try {
        if (!msg.document) {
            await bot.deleteMessage(chatId, statusMsg.message_id);
            return bot.sendMessage(chatId, `${EMOJIS.cross} Please as a <b>document</b> bhejo.`, { parse_mode: 'HTML' });
        }

        const token = users[userId]?.github_token;
        const { repo, targetPath, type } = state.data;

        const userResult = await githubGet(token, '/user');
        if (!userResult.success) throw new Error('User fetch failed: ' + userResult.error);
        const username = userResult.data.login;

        const fileId = msg.document.file_id;
        const fileName = msg.document.file_name;

        await bot.editMessageText(`${EMOJIS.rocket} Downloading from Telegram...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });

        const fileLink = await bot.getFileLink(fileId);
        const fileResponse = await axios.get(fileLink, { responseType: 'arraybuffer', timeout: 120000 });
        const fileBuffer = Buffer.from(fileResponse.data);

        clearState(userId);

        await bot.editMessageText(`${EMOJIS.rocket} Uploading to GitHub...`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });

        if (type === 'zip' || fileName.endsWith('.zip')) {
            const zipPath = path.join(CONFIG.TEMP_DIR, `${userId}_${Date.now()}.zip`);
            fs.writeFileSync(zipPath, fileBuffer);

            const zip = new AdmZip(zipPath);
            const zipEntries = zip.getEntries();
            let uploaded = 0;
            let failed = 0;
            const totalFiles = zipEntries.filter(e => !e.isDirectory).length;

            if (totalFiles === 0) {
                fs.unlinkSync(zipPath);
                await bot.deleteMessage(chatId, statusMsg.message_id);
                return bot.sendMessage(chatId, `${EMOJIS.cross} ZIP ke andar koi file nahi mili.`, { parse_mode: 'HTML' });
            }

            for (const entry of zipEntries) {
                if (entry.isDirectory) continue;
                const entryData = entry.getData();
                let relativePath = entry.entryName.replace(/\\/g, '/').replace(/^\//, '');
                const fullPath = targetPath + relativePath;

                try {
                    await uploadFileToGitHub(token, username, repo, fullPath, entryData);
                    uploaded++;
                } catch (e) {
                    console.error('Upload failed for', relativePath, e.message);
                    failed++;
                }

                if ((uploaded + failed) % 5 === 0 || (uploaded + failed) === totalFiles) {
                    await bot.editMessageText(
                        `${EMOJIS.zip} Uploading... ${uploaded + failed}/${totalFiles}\n✅ Done: ${uploaded} | ❌ Failed: ${failed}`,
                        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
                    );
                }
            }

            fs.unlinkSync(zipPath);

            await bot.editMessageText(
                `${EMOJIS.success} <b>ZIP Upload Complete!</b>\n\n✅ Uploaded: <b>${uploaded}</b> files\n${failed > 0 ? `❌ Failed: <b>${failed}</b>\n` : ''}📁 Repo: <b>${escapeHtml(repo)}</b>`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
            );

        } else {
            const fullPath = targetPath + fileName;
            await uploadFileToGitHub(token, username, repo, fullPath, fileBuffer);

            await bot.editMessageText(
                `${EMOJIS.success} <b>File Uploaded!</b>\n\n📄 <b>${escapeHtml(fileName)}</b>\n📁 Path: <code>${escapeHtml(fullPath)}</code>\n🗄️ Repo: <b>${escapeHtml(repo)}</b>`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
            );
        }

    } catch (error) {
        console.error('Upload error:', error);
        clearState(userId);
        try {
            await bot.editMessageText(
                `${EMOJIS.cross} <b>Upload Failed</b>\n\nError: ${escapeHtml(error.message)}`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
            );
        } catch (e) {
            await bot.sendMessage(chatId, `${EMOJIS.cross} <b>Upload Failed</b>\n\nError: ${escapeHtml(error.message)}`, { parse_mode: 'HTML' });
        }
    }
}

async function uploadFileToGitHub(token, owner, repo, filePath, content) {
    const base64Content = content.toString('base64');
    let sha = null;
    const checkResult = await githubGet(token, `/repos/${owner}/${repo}/contents/${filePath}`);
    if (checkResult.success && checkResult.data?.sha) sha = checkResult.data.sha;

    const data = { message: `Uploaded via ${CONFIG.BOT_NAME}`, content: base64Content };
    if (sha) data.sha = sha;

    const result = await githubPut(token, `/repos/${owner}/${repo}/contents/${filePath}`, data);
    if (!result.success) throw new Error(result.error);
    return result;
}

bot.on('polling_error', (error) => console.error('Polling error:', error.message));
bot.on('error', (error) => console.error('Bot error:', error.message));

console.log(`${CONFIG.BOT_NAME} bot started successfully!`);
console.log('Waiting for messages...');
