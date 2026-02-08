import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) => {
  const baseClasses = 'font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: "bg-[#2563eb] text-white shadow-[4px_4px_0px_0px_#0f172a] hover:bg-[#1d4ed8] hover:shadow-[6px_6px_0px_0px_#0f172a] hover:-translate-y-1 border-2 border-slate-900",
    secondary: "bg-white text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] hover:bg-slate-50 hover:shadow-[6px_6px_0px_0px_#0f172a] hover:-translate-y-1 border-2 border-slate-900 dark:bg-slate-800 dark:text-white dark:border-slate-700 dark:shadow-black",
    outline: "bg-transparent text-slate-900 border-2 border-slate-900 hover:bg-slate-100 dark:text-white dark:border-white dark:hover:bg-slate-800",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-base',
    lg: 'px-7 py-3.5 text-lg'
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
