import * as rrb from 'redis-request-broker';
const { Client, Worker, Subscriber } = rrb;
import telegraf from 'telegraf';
import * as log from './log.js';
let current_instance;

export async function start() {
    try {
        console.log('Starting up...');
        const config = await getConfig();
        await log.start(config.channels.logging);
        current_instance = await build(config);
        await log.log('notice', 'Startup complete');
    }
    catch (error) {
        log.log('error', 'Failed to start up', error);
        await stop();
    }
}

export async function stop() {
    try {
        await log.log('notice', 'Shutting down...');
        await Promise.all([
            (async () => current_instance && await current_instance.stop())(),
            log.stop()
        ]);
        console.log('Shutdown complete.');
        process.exit(0);
    }
    catch (error) {
        console.error('Failed to shut down');
        console.error(error);
        process.exit(1);
    }
}

export async function restart() {
    await stop();
    await start();
}

async function build(config) {


    let bot;
    let cache = undefined;
    const workerIsAdmin = new Worker(config.channels.permissions.isAdmin, is_admin);
    const workerCanChangeInfo = new Worker(config.channels.permissions.canChangeInfo, can_change_info);
    const workerCanDeleteMessages = new Worker(config.channels.permissions.canDeleteMessages, can_delete_messages);
    const subscriberConfigChanged = new Subscriber(config.channels.config.changed, restart);

    try {
        bot = new telegraf.Telegraf(config.telegram.bot_token);
        await Promise.all([
            workerIsAdmin.listen(),
            workerCanChangeInfo.listen(),
            workerCanDeleteMessages.listen(),
            subscriberConfigChanged.listen()
        ]);
    }
    catch (error) {
        await stop();
        throw error
    }


    async function getAdmins() {
        if (cache)
            return cache

        await log.log('debug', 'Updating permissions cache');
        cache = bot.telegram.getChatAdministrators(config.telegram.group_id);
        setTimeout(() => cache = undefined, config.permissions.ttl);
        return cache;
    }

    async function can_delete_messages(user_id) {
        const admins = await getAdmins();
        return admins.some(a => a.user.id == user_id && (a.status == 'creator' || a.can_delete_messages));
    }

    async function can_change_info(user_id) {
        const admins = await getAdmins();
        return admins.some(a => a.user.id == user_id && (a.status == 'creator' || a.can_change_info));
    }

    async function is_admin(user_id) {
        const admins = await getAdmins();
        return admins.some(a => a.user.id == user_id);
    }

    async function stop() {
        try {
            await Promise.all([
                workerIsAdmin.stop(),
                workerCanChangeInfo.stop(),
                workerCanDeleteMessages.stop(),
                subscriberConfigChanged.stop()
            ]);
        }
        catch (error) {
            log.log('error', 'Failed to stop', error);
        }
    }

    return { stop };
}


async function getConfig() {
    try {
        const worker = new Client('config:get', { timeout: 10000 });
        await worker.connect();
        const [telegram, permissions, channels] = await worker.request(['telegram', 'permissions', 'rrb:channels']);
        await worker.disconnect();
        return { telegram, permissions, channels };
    }
    catch (error) {
        console.error('Failed to get config');
        throw error;
    }
}