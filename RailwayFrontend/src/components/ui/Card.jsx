import React from 'react';

const Card = ({ children, className = '', hover = true, padding = 'p-6', ...props }) => {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${padding} ${
        hover ? 'hover:shadow-xl hover:border-primary-200 transition-all duration-300 transform hover:-translate-y-1' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;