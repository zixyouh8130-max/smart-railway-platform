import React from 'react';

const TrainAnimation = () => {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-32 overflow-hidden">
      {/* Train Track */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="relative h-4 bg-gray-800">
          {/* Track ties */}
          <div className="absolute inset-0 flex">
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="h-full bg-gray-700 mx-4"
                style={{ width: '4px' }}
              />
            ))}
          </div>
          {/* Rails */}
          <div className="absolute top-1 left-0 right-0 h-0.5 bg-gray-400" />
          <div className="absolute bottom-1 left-0 right-0 h-0.5 bg-gray-400" />
        </div>
      </div>

      {/* Animated Train */}
      <div className="absolute bottom-4 animate-train-move">
        <div className="relative">
          {/* Steam */}
          <div className="absolute -top-12 left-8">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-steam"
                style={{
                  left: `${i * 15}px`,
                  animationDelay: `${i * 0.5}s`,
                }}
              >
                <div className="w-4 h-4 bg-white/60 rounded-full blur-sm" />
              </div>
            ))}
          </div>

          {/* Train Body */}
          <div className="flex items-end">
            {/* Engine */}
            <div className="relative">
              <div className="w-48 h-20 bg-accent-500 rounded-t-2xl rounded-b-lg border-2 border-accent-600">
                {/* Window */}
                <div className="absolute top-2 left-4 w-8 h-8 bg-highlight-200 rounded-lg border-2 border-accent-600" />
                {/* Chimney */}
                <div className="absolute -top-6 left-12 w-6 h-8 bg-gray-700 rounded-t-lg" />
                {/* Headlight */}
                <div className="absolute top-6 -left-1 w-4 h-4 bg-highlight-500 rounded-full shadow-lg shadow-highlight-500/50" />
              </div>
              {/* Wheels */}
              <div className="absolute -bottom-3 left-6 w-8 h-8 bg-gray-800 rounded-full border-4 border-gray-600 animate-train-wheel" />
              <div className="absolute -bottom-3 right-6 w-8 h-8 bg-gray-800 rounded-full border-4 border-gray-600 animate-train-wheel" />
            </div>

            {/* Coaches */}
            {[...Array(3)].map((_, i) => (
              <div key={i} className="relative ml-1">
                <div className="w-40 h-20 bg-accent-500/80 rounded-lg border-2 border-accent-600">
                  {/* Windows */}
                  <div className="absolute top-3 left-3 right-3 flex justify-between">
                    {[...Array(3)].map((_, j) => (
                      <div
                        key={j}
                        className="w-6 h-8 bg-highlight-100 rounded border border-accent-400"
                      />
                    ))}
                  </div>
                </div>
                <div className="absolute -bottom-3 left-4 w-7 h-7 bg-gray-800 rounded-full border-4 border-gray-600 animate-train-wheel" />
                <div className="absolute -bottom-3 right-4 w-7 h-7 bg-gray-800 rounded-full border-4 border-gray-600 animate-train-wheel" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainAnimation;