export function decodeJwtExp(token: string): number | null {
    try {
        const payload = token.split(".")[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const decoded = JSON.parse(atob(normalized));
        return typeof decoded.exp === "number" ? decoded.exp : null;
    } catch {
        return null;
    }
}

export function isJwtExpired(token: string | null | undefined, leewaySec = 0): boolean {
    if (!token) return true;
    const exp = decodeJwtExp(token);
    if (exp == null) return true;
    return Date.now() / 1000 + leewaySec >= exp;
}
