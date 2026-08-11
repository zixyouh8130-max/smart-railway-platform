import React from 'react';
import { Ticket, Clock, RefreshCw, AlertCircle, Gift, Map, ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';

const QuickActions = () => {
  const actions = [
    {
      icon: <Ticket className="w-6 h-6" />,
      title: 'E-Ticket Booking',
      description: 'Book tickets online with instant confirmation',
      color: 'bg-railway-red-100 text-railway-red-500',
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: 'Train Schedule',
      description: 'Check timings and route information',
      color: 'bg-railway-orange-100 text-railway-orange-500',
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: 'PNR Status',
      description: 'Track your booking status instantly',
      color: 'bg-railway-green-100 text-railway-green-500',
    },
    {
      icon: <AlertCircle className="w-6 h-6" />,
      title: 'Live Updates',
      description: 'Real-time running status and delays',
      color: 'bg-railway-yellow-100 text-railway-yellow-600',
    },
    {
      icon: <Gift className="w-6 h-6" />,
      title: 'Special Offers',
      description: 'Exclusive deals and seasonal discounts',
      color: 'bg-railway-red-100 text-railway-red-500',
    },
    {
      icon: <Map className="w-6 h-6" />,
      title: 'Route Map',
      description: 'Interactive railway network visualization',
      color: 'bg-railway-orange-100 text-railway-orange-500',
    },
  ];

  return (
    <section className="py-20 bg-gray-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-2 bg-railway-red-100 text-railway-red-600 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <span className="w-2 h-2 bg-railway-red-500 rounded-full animate-pulse-soft mr-2" />
            Quick Access
          </div>
          <p className="text-xl text-center text-gray-600 mx-auto">
            All essential railway services at your fingertips
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {actions.map((action, index) => (
            <Card key={index} className="group cursor-pointer">
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-xl ${action.color} transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                  {action.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">{action.title}</h3>
                  <p className="text-sm text-gray-600 mb-4">{action.description}</p>
                  <a
                    href="#"
                    className="inline-flex items-center text-sm font-medium text-railway-red-500 hover:text-railway-red-600"
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default QuickActions;