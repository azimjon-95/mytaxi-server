import axios, { AxiosError } from "axios";
import dotenv from "dotenv";

dotenv.config(); // Migratsiya davrida qolsin; idealda faqat entrypoint'da chaqiriladi.

export type LatLng = {
    latitude: number;
    longitude: number;
};

type GraphHopperRouteResponse = {
    paths?: Array<{
        distance: number; // meters
        time: number; // milliseconds
    }>;
};

export type RouteInfo = {
    distanceKm: number;  // km
    durationMin: number; // minutes
};

export const getDistanceFromGraphHopper = async (
    startLocation: LatLng,
    endLocation: LatLng
): Promise<RouteInfo | null> => {
    const apiKey = process.env.GRAPH_API_KEY;
    const baseUrl = process.env.GRAPH_API_URL;

    if (!apiKey) {
        console.error("GraphHopper error: GRAPH_API_KEY env topilmadi");
        return null;
    }
    if (!baseUrl) {
        console.error("GraphHopper error: GRAPH_API_URL env topilmadi");
        return null;
    }

    try {
        const url =
            `${baseUrl}/route` +
            `?point=${startLocation.latitude},${startLocation.longitude}` +
            `&point=${endLocation.latitude},${endLocation.longitude}` +
            `&vehicle=car&key=${apiKey}`;

        const { data } = await axios.get<GraphHopperRouteResponse>(url);

        if (!data.paths || data.paths.length === 0) return null;

        const path = data.paths[0];

        return {
            distanceKm: Number((path.distance / 1000).toFixed(2)),
            durationMin: Math.round(path.time / 60000)
        };
    } catch (err: unknown) {
        const e = err as AxiosError;
        const msg =
            (e.response?.data && typeof e.response.data === "string" && e.response.data) ||
            e.message ||
            String(err);

        console.error("GraphHopper error:", msg);
        return null;
    }
};
