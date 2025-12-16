import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config(); // .env faylni o‘qiydi


export const getDistanceFromGraphHopper = async (startLocation, endLocation) => {
    const apiKey = process.env.GRAPH_API_KEY;
    try {
        const url = `${process.env.GRAPH_API_URL}/route?point=${startLocation.latitude},${startLocation.longitude}&point=${endLocation.latitude},${endLocation.longitude}&vehicle=car&key=${apiKey}`;

        const { data } = await axios.get(url);

        if (!data.paths || !data.paths.length) return null;

        const path = data.paths[0];

        return {
            distanceKm: +(path.distance / 1000).toFixed(2), // km
            durationMin: Math.round(path.time / 60000),     // minut
        };

    } catch (err) {
        console.error("GraphHopper error:", err.message);
        return null;
    }
};