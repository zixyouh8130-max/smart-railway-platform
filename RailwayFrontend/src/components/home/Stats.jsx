import React, { useState, useEffect, useRef } from 'react';
import { Users, Train, Ticket, Star } from 'lucide-react';

const Counter = ({ end, duration = 2000 }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let startTime;
          const animate = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const progress = (currentTime - startTime) / duration;

            if (progress < 1) {
              setCount(Math.floor(progress * end));
              requestAnimationFrame(animate);
            } else {
              setCount(end);
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (countRef.current) {
      observer.observe(countRef.current);
    }

    return () => observer.disconnect();
  }, [end, duration, hasAnimated]);

  return <span ref={countRef}>{count.toLocaleString()}+</span>;
};

const Stats = () => {
  const stats = [
    { icon: <Users className="w-8 h-8" />, value: 25, label: 'Million Happy Travelers', suffix: 'M+' },
    { icon: <Train className="w-8 h-8" />, value: 10000, label: 'Trains Daily', suffix: '+' },
    { icon: <Ticket className="w-8 h-8" />, value: 1, label: 'Million Tickets Booked', suffix: 'M+' },
    { icon: <Star className="w-8 h-8" />, value: 4.8, label: 'Average User Rating', suffix: '/5' },
  ];

  return (
    <section className="py-20 bg-gradient-to-r from-railway-red-600 via-railway-orange-500 to-railway-green-600 w-full relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px',
            animation: 'moveTracks 3s linear infinite',
          }}
        />
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center text-white group animate-bounce-in"
              style={{ animationDelay: `${index * 0.2}s` }}
            >
              <div className="inline-flex p-4 bg-white/20 rounded-2xl mb-4 group-hover:bg-white/30 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                {stat.icon}
              </div>
              <div className="text-5xl font-bold mb-2">
                {typeof stat.value === 'number' && stat.value > 10 ? (
                  <Counter end={stat.value} />
                ) : (
                  stat.suffix
                )}
              </div>
              <div className="text-white/80 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;