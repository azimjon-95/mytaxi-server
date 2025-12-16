class DriverLocationService {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }

    // 🔹 Barcha driver locationlarini olish
    getAllDriverLocations = async () => {
        const keys = await this.redisClient.keys('driver:*:location');

        if (keys.length === 0) {
            return [];
        }

        const values = await this.redisClient.mGet(keys);
        const result = keys.map((key, index) => {
            const driverId = key.split(':')[1];
            const loc = values[index] ? JSON.parse(values[index]) : null;
            return { driverId, ...loc };
        });

        return result;
    };

    // 🔹 Driver locationini id bo'yicha olish
    getDriverLocationById = async (driverId) => {
        const data = await this.redisClient.get(`driver:${driverId}:location`);
        if (!data) return null;
        return JSON.parse(data);
    };
}

module.exports = DriverLocationService;
