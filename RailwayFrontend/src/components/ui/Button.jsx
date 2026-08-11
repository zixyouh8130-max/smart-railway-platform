import React from 'react';

const variants = {
  primary: 'bg-railway-red-500 hover:bg-railway-red-600 text-white shadow-lg hover:shadow-xl shadow-railway-red-500/25',
  secondary: 'bg-railway-orange-500 hover:bg-railway-orange-600 text-white shadow-lg hover:shadow-xl shadow-railway-orange-500/25',
  outline: 'bg-transparent hover:bg-railway-red-50 text-railway-red-500 border-2 border-railway-red-500',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
  highlight: 'bg-railway-yellow-500 hover:bg-railway-yellow-600 text-gray-900 shadow-lg hover:shadow-xl shadow-railway-yellow-500/25',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

const Button = ({ children, variant = 'primary', size = 'md', className = '', icon, ...props }) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-railway-red-500 focus:ring-offset-2 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span className="text-xl">{icon}</span>}
      {children}
    </button>
  );
};

export default Button;