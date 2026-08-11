import React from 'react';
import { UtensilsCrossed, Wifi, Bed, Shield, ChevronRight } from 'lucide-react';

const Services = () => {
  const services = [
    {
      icon: <UtensilsCrossed className="w-8 h-8" />,
      title: 'E-Catering',
      description: 'Order meals delivered to your seat',
      color: 'from-railway-orange-400 to-railway-red-400'
    },
    {
      icon: <Wifi className="w-8 h-8" />,
      title: 'Rail Wi-Fi',
      description: 'Internet at stations and trains',
      color: 'from-railway-green-400 to-railway-green-600'
    },
    {
      icon: <Bed className="w-8 h-8" />,
      title: 'Retiring Rooms',
      description: 'Comfortable station accommodation',
      color: 'from-railway-red-400 to-railway-red-600'
    },
  ];

  return (
    <section className="py-20 bg-gradient-to-br from-gray-900 to-gray-800 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Additional Services</h2>
          <p className="text-xl text-gray-300">Enhance your travel experience</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div key={index} className="group relative bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:bg-white/10 transition-all duration-300">
              <div className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${service.color} mb-6 text-white`}>
                {service.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{service.title}</h3>
              <p className="text-gray-400 mb-6">{service.description}</p>
              <a href="#" className="inline-flex items-center text-railway-orange-400 hover:text-railway-orange-300 font-medium">
                Learn More
                <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;