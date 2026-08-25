import React from 'react';
import { Train, Mail, Phone, MapPin, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/button';

const Footer = () => {
  const footerLinks = {
    services: ['Online Booking', 'PNR Status'],
    company: ['About Us','Blog', 'Partners'],
    support: [],
  };

  return (
    <footer className="bg-gray-900 text-gray-300 w-full">
      {/* Newsletter */}
      <div className="border-b border-gray-800">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Stay Updated</h3>
              <p className="text-gray-400">Get the latest updates on schedules, offers, and services.</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 focus:outline-none focus:border-accent-500 text-white flex-1 md:w-80"
              />
              <Button variant="secondary" className="bg-accent-500 hover:bg-accent-600 text-white">
                Subscribe
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center">
                <Train className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">RailConnect</span>
            </div>
            <p className="text-gray-400 mb-6">
              Your trusted platform for seamless railway services.
            </p>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 text-sm">
                <Mail className="w-4 h-4 text-accent-400" />
                <span>myanmarailways.npt@gmail.com</span>
              </div>
              <div className="flex items-center space-x-3 text-sm">
                <Phone className="w-4 h-4 text-accent-400" />
                <span> +95-53-24508</span>
              </div>
              <div className="flex items-center space-x-3 text-sm">
                <MapPin className="w-4 h-4 text-accent-400" />
                <span>Bogyoke Road, Pyay Township, Pyay District, Bago Region, Myanmar</span>
              </div>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-white font-semibold mb-4 capitalize">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-gray-400 hover:text-accent-400 transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">© 2024 RailConnect. All rights reserved.</p>
            <div className="flex space-x-6">
              <a href="#" className="text-sm text-gray-400 hover:text-accent-400 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-gray-400 hover:text-accent-400 transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-sm text-gray-400 hover:text-accent-400 transition-colors">
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;