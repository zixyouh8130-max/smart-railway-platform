// src/components/admin/SeatLayout.jsx
import React from 'react';

const SEAT_COLORS = {
  UPPER_CLASS: 'bg-amber-100 border-amber-300 text-amber-800',
  WINDOW: 'bg-blue-100 border-blue-300 text-blue-800',
  AISLE: 'bg-green-100 border-green-300 text-green-800',
  MIDDLE: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  DINING: 'bg-purple-100 border-purple-300 text-purple-800',
  REGULAR: 'bg-gray-100 border-gray-300 text-gray-800'
};

const SeatLayout = ({ rows, seatsPerRow, coachType, onSeatClick, bookedSeats = [] }) => {
  const getSeatType = (position) => {
    if (coachType === 'UPPER_CLASS') return 'UPPER_CLASS';
    if (coachType === 'SLEEPER') {
      return position === 1 || position === seatsPerRow ? 'WINDOW' : 'REGULAR';
    }
    if (coachType === 'ECONOMY_CLASS') {
      if (position === 1 || position === seatsPerRow) return 'WINDOW';
      if (position === 2 || position === seatsPerRow - 1) return 'AISLE';
      return 'MIDDLE';
    }
    if (coachType === 'DINING') return 'DINING';
    return 'REGULAR';
  };

  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center justify-center space-x-2">
          <span className="text-xs text-gray-500 w-6 text-right">{rowIndex + 1}</span>
          {Array.from({ length: seatsPerRow }, (_, seatIndex) => {
            const seatType = getSeatType(seatIndex + 1);
            const seatNumber = `${String.fromCharCode(65 + seatIndex)}${rowIndex + 1}`;
            const isBooked = bookedSeats.includes(seatNumber);
            
            return (
              <button
                key={seatIndex}
                onClick={() => onSeatClick && onSeatClick(seatNumber)}
                disabled={isBooked}
                className={`
                  w-8 h-8 rounded border text-xs font-medium
                  transition-all duration-200
                  ${isBooked 
                    ? 'bg-red-200 border-red-400 cursor-not-allowed opacity-60' 
                    : `${SEAT_COLORS[seatType]} hover:scale-110 hover:shadow-md cursor-pointer`
                  }
                `}
                title={`${seatNumber} - ${seatType.replace('_', ' ')}`}
              >
                {seatNumber}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default SeatLayout;