import { ArrowRight, BellRing, TicketCheck, TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';

const QuickActions = () => {
  const actions = [
    {
      icon: TicketCheck,
      eyebrow: 'လက်မှတ်ဝယ်ရန်',
      title: 'ခရီးစဉ်ရှာပြီး ထိုင်ခုံရွေးပါ',
      description: 'ပင်မစာမျက်နှာအပေါ်ပိုင်းမှ ဘူတာနှစ်ခုနှင့် ရက်စွဲရွေးပြီး ရရှိနိုင်သော အချိန်ဇယားများကို တိုက်ရိုက်ရှာနိုင်ပါသည်။',
      to: '/',
      action: 'ခရီးစဉ်ရှာမည်',
    },
    {
      icon: BellRing,
      eyebrow: 'လက်မှတ်အခြေအနေ',
      title: 'သင့်ရထား စတင်ပြေးဆွဲမှုကို စောင့်ကြည့်ပါ',
      description: 'လက်မှတ်နံပါတ်နှင့် ရထားအချက်အလက်ဖြင့် booking status၊ schedule နှင့် ပြေးဆွဲချိန် live updates ကို စစ်ဆေးနိုင်ပါသည်။',
      to: '/pnr-status',
      action: 'အခြေအနေစစ်မည်',
    },
    {
      icon: TrainFront,
      eyebrow: 'လက်ရှိပြေးဆွဲမှု',
      title: 'ယခုလက်ရှိ ရထားအားလုံးကို ကြည့်ပါ',
      description: 'ACTIVE ဖြစ်နေသော ရထားများ၏ လက်ရှိ/နောက်တစ်ဘူတာ၊ တိုးတက်မှု၊ နောက်ကျချိန်နှင့် GPS update ကို ကြည့်နိုင်ပါသည်။',
      to: '/running-trains',
      action: 'အားလုံးကြည့်မည်',
    },
  ];

  return (
    <section className="relative z-10 -mt-6 px-4 pb-12 sm:-mt-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/8 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {actions.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to + item.eyebrow}
                to={item.to}
                onClick={() => {
                  if (item.to === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`group rounded-2xl p-5 text-left transition-all hover:bg-slate-50 ${index < actions.length - 1 ? 'lg:border-r lg:border-slate-100' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 transition-colors group-hover:bg-blue-700 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">{item.eyebrow}</p>
                    <h2 className="mt-2 !mb-0 !text-lg !font-bold !leading-7 text-slate-950">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700">
                      {item.action}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default QuickActions;
