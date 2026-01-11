// Kilometr hisoblash funksiyasi (Haversine)
export function getDistanceFromLatLonInKm(
    lat1: number | string,
    lon1: number | string,
    lat2: number | string,
    lon2: number | string
): number {
    const _lat1 = Number(lat1);
    const _lon1 = Number(lon1);
    const _lat2 = Number(lat2);
    const _lon2 = Number(lon2);

    if (
        !Number.isFinite(_lat1) ||
        !Number.isFinite(_lon1) ||
        !Number.isFinite(_lat2) ||
        !Number.isFinite(_lon2)
    ) {
        throw new Error("Invalid coordinates: lat/lon must be finite numbers");
    }

    const R = 6371; // Yer radiusi km
    const dLat = ((_lat2 - _lat1) * Math.PI) / 180;
    const dLon = ((_lon2 - _lon1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((_lat1 * Math.PI) / 180) *
        Math.cos((_lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
