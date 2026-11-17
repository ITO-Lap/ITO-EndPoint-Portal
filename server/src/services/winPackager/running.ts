// Jobs that a background task in THIS process is currently working on (validation / packaging / extraction).
export const running = new Set<string>()
