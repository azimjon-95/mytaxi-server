import type { RedisClientType } from "redis";

export type DriverLocation = {
    latitude: number;
    longitude: number;
};

export type DriverLocationWithId = {
    driverId: string;
    latitude?: number;
    longitude?: number;
};

function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export default class DriverLocationService {
    private redisClient: RedisClientType;

    constructor(redisClient: RedisClientType) {
        this.redisClient = redisClient;
    }

    // 🔹 Barcha driver locationlarini olish
    getAllDriverLocations = async (): Promise<DriverLocationWithId[]> => {
        const keys: string[] = await this.redisClient.keys("driver:*:location");
        if (keys.length === 0) return [];

        const values: Array<string | null> = await this.redisClient.mGet(keys);

        return keys.map((key, index) => {
            const driverId = key.split(":")[1] ?? "";
            const loc = safeJsonParse<DriverLocation>(values[index]);
            return loc ? { driverId, ...loc } : { driverId };
        });
    };

    // 🔹 Driver locationini id bo'yicha olish
    getDriverLocationById = async (driverId: string): Promise<DriverLocation | null> => {
        const data = await this.redisClient.get(`driver:${driverId}:location`);
        return safeJsonParse<DriverLocation>(data);
    };
}
