import { useEffect, useState } from 'react';
import type { Task, Priority } from './types';

const STORAGE_KEY = 'velora-react';

export function useTasks() {
    const [tasks, setTasks] = useState<Task[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setTasks(JSON.parse(saved));
    }, []);

        useEffect(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }, [tasks]);

        const addTask = (title: string, priority: Priority) => {
            setTasks(prev => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                     title,
                     completed: false,
                     tags: [],
                     createdAt: Date.now(),
                     priority,
                     focusPinned: false,
                     order: prev.length
                }
            ]);
        };

        const toggleTask = (id: string) => {
            setTasks(prev =>
            prev.map(t =>
            t.id === id ? { ...t, completed: !t.completed } : t
            )
            );
        };

        const removeTask = (id: string) => {
            setTasks(prev => prev.filter(t => t.id !== id));
        };

        return { tasks, setTasks, addTask, toggleTask, removeTask };
}
