import React, {MouseEventHandler} from "react";

interface IconProps {
    icon: string;
    className?: string;
    hexColor?: string;
    clickable?: boolean;
    onClick?: MouseEventHandler<HTMLSpanElement> | undefined;
    onMouseDown?: MouseEventHandler<HTMLSpanElement> | undefined;
}

export const Icon = React.forwardRef(
    (
        {icon, className = "", onClick, onMouseDown, hexColor, clickable, ...passedProps}: IconProps,
        ref: React.ForwardedRef<HTMLSpanElement | SVGElement>
    ): JSX.Element | null => {
        if (icon) {
            const mergedClasses = `material-symbols-outlined select-none ${
                (onClick || onMouseDown || clickable) ? "cursor-pointer" : ""
            } ${className}`.trim();

            return (
                <div style={{fontVariationSettings: "'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 48"}}>
                    <span
                        ref={ref as React.ForwardedRef<HTMLSpanElement>}
                        onClick={onClick}
                        onMouseDown={onMouseDown}
                        className={mergedClasses}
                        translate="no"
                        style={{color: hexColor}}
                        {...passedProps}
                    >
                        {icon}
                    </span>
                </div>
            );
        }

        return null;
    }
);

export default Icon;
