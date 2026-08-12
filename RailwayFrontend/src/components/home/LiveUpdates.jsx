import React from 'react';
import { Train, Clock, MapPin, AlertTriangle, ChevronRight } from 'lucide-react';
import Card from '@/components/ui/card';

const LiveUpdates = () => {
  const updates = [
    {
      trainNo: '12301',
      name: 'Rajdhani Express',
      from: 'New Delhi',
      to: 'Mumbai Central',
      status: 'On Time',
      nextStation: 'Kota Junction',
      eta: '14:30',
      statusColor: 'bg-green-100 text-green-700'
    },
    {
      trainNo: '12951',
      name: 'Mumbai Rajdhani',
      from: 'Mumbai Central',
      to: 'New Delhi',
      status: 'Delayed',
      delay: '25 mins',
      nextStation: 'Ratlam Junction',
      eta: '16:45',
      statusColor: 'bg-red-100 text-red-700'
    },
    {
      trainNo: '12259',
      name: 'Sealdah Duronto',
      from: 'Kolkata',
      to: 'New Delhi',
      status: 'On Time',
      nextStation: 'Dhanbad Junction',
      eta: '11:15',
      statusColor: 'bg-green-100 text-green-700'
    },
  ];

  return (
    <section className="py-20 bg-white w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Live Train Updates</h2>
            <p className="text-xl text-gray-600">Real-time tracking of major trains</p>
          </div>
          <a href="#" className="hidden md:flex items-center text-railway-red-500 hover:text-railway-red-600 font-medium">
            View All Trains
            <ChevronRight className="w-5 h-5 ml-1" />
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {updates.map((train, index) => (
            <Card key={index}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-railway-red-50 rounded-lg">
                    <Train className="w-6 h-6 text-railway-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{train.name}</h3>
                    <p className="text-sm text-gray-500">Train #{train.trainNo}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${train.statusColor}`}>
                  {train.status}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                  <span>{train.from}</span>
                  <span className="mx-2">→</span>
                  <span>{train.to}</span>
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 text-gray-400 mr-2" />
                  <span>Next: {train.nextStation}</span>
                  <span className="ml-auto font-medium text-gray-900">ETA: {train.eta}</span>
                </div>
                {train.delay && (
                  <div className="flex items-center text-sm text-red-600 bg-red-50 rounded-lg p-2">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Delayed by {train.delay}
                  </div>
                )}
              </div>

              <button className="mt-4 w-full py-2 text-sm font-medium text-railway-red-500 hover:bg-railway-red-50 rounded-lg transition-colors">
                Track Live Location
              </button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LiveUpdates;