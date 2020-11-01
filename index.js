import * as permissions from './src/permissions.js';
import rrb from 'redis-request-broker';


async function start() {
    try {
        rrb.Defaults.setDefaults({
            redis: {
                prefix: process.env.REDIS_PREFIX || 'mh:',
                host: process.env.REDIS_HOST || "mhredis",
                port: process.env.REDIS_PORT || undefined,
                db: process.env.REDIS_DB || undefined,
                password: process.env.REDIS_PASSWORD || undefined
            }
        });
        await permissions.start();
    }
    catch (error) {
        console.error('Failed to start');
        console.error(error);
        process.exit(1);
    }
}

async function stop() {
    try {
        await permissions.stop();
        process.exit(0)
    }
    catch (error) {
        console.error("Exit with error");
        console.error(error);
        process.exit(1);
    }
}

process.on('SIGINT', stop);
process.on('SIGQUIT', stop);
process.on('SIGTERM', stop);
start();
