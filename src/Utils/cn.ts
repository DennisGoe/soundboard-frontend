import {twMerge} from "tailwind-merge";
import clsx from "clsx";

export function cn(...inputs: any[]): string {
    return twMerge(clsx(...inputs));
}
