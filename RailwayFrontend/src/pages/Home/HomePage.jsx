import HeroSection from '@/components/home/HeroSection';
import QuickActions from '@/components/home/QuickActions';
import HomeTicketTracker from '@/components/home/HomeTicketTracker';
import LiveUpdates from '@/components/home/LiveUpdates';
import Services from '@/components/home/Services';

const HomePage = () => (
  <div className="w-full bg-slate-50">
    {/* Hero content and UI intentionally preserved. */}
    <HeroSection />
    <QuickActions />
    <HomeTicketTracker />
    <LiveUpdates />
    <Services />
  </div>
);

export default HomePage;
