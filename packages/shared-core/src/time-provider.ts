export interface TimeProvider {
    now(): Date;
}

export class SystemTimeProvider implements TimeProvider {
    now(): Date {
        return new Date();
    }
}

export class OffsetTimeProvider implements TimeProvider {
    private readonly offsetMs: number;
    private readonly base: TimeProvider;

    constructor(offsetMs: number, base: TimeProvider = new SystemTimeProvider()) {
        this.offsetMs = offsetMs;
        this.base = base;
    }

    now(): Date {
        return new Date(this.base.now().getTime() + this.offsetMs);
    }
}

