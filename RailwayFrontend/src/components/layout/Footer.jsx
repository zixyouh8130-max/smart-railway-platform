import { Mail, MapPin, Phone, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer = () => (
  <footer className="w-full border-t border-slate-800 bg-slate-950 text-slate-300">
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 md:grid-cols-[1.4fr_0.8fr_1fr]">
        <div className="text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <TrainFront className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-white">ရထားဆက်သွယ်ရေး</p>
              <p className="text-xs text-slate-500">Passenger Railway Service</p>
            </div>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            လက်မှတ်ရှာဖွေခြင်း၊ ထိုင်ခုံရွေးချယ်ခြင်း၊ လက်မှတ်အခြေအနေစစ်ဆေးခြင်းနှင့် လက်ရှိပြေးဆွဲနေသော ရထားအချက်အလက်များကို တစ်နေရာတည်းတွင် အသုံးပြုနိုင်ပါသည်။
          </p>
        </div>

        <div className="text-left">
          <p className="text-sm font-semibold text-white">အမြန်လင့်ခ်များ</p>
          <div className="mt-4 space-y-3 text-sm text-slate-400">
            <Link to="/" className="block hover:text-white">လက်မှတ်ဝယ်ရန်</Link>
            <Link to="/pnr-status" className="block hover:text-white">လက်မှတ်အခြေအနေ</Link>
            <Link to="/running-trains" className="block hover:text-white">လက်ရှိပြေးဆွဲမှု</Link>
          </div>
        </div>

        <div className="text-left">
          <p className="text-sm font-semibold text-white">ဆက်သွယ်ရန်</p>
          <div className="mt-4 space-y-3 text-sm text-slate-400">
            <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" /> myanmarailways.npt@gmail.com</p>
            <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" /> +95-53-24508</p>
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> Bogyoke Road, Pyay Township, Bago Region, Myanmar</p>
          </div>
        </div>
      </div>

      <div className="mt-9 flex flex-col gap-2 border-t border-slate-800 pt-6 text-left text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 Railway Passenger Service.</p>
        <p>အချိန်ဇယားနှင့် တိုက်ရိုက်အခြေအနေများကို backend data အတိုင်း ပြသပါသည်။</p>
      </div>
    </div>
  </footer>
);

export default Footer;
