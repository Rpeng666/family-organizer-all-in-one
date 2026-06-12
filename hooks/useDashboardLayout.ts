'use client';

import React, { useEffect, useRef, useState } from 'react';

export function useIsDesktop(): boolean {
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(min-width: 1024px)');
        const sync = () => setIsDesktop(mq.matches);
        sync();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', sync);
            return () => mq.removeEventListener('change', sync);
        }
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        mq.addListener(sync);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        return () => mq.removeListener(sync);
    }, []);
    return isDesktop;
}

export function useElementHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
    const ref = useRef<T | null>(null);
    const [height, setHeight] = useState(0);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const update = () => setHeight(node.clientHeight);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, height];
}

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
    const ref = useRef<T | null>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const update = () => setWidth(node.clientWidth);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}
