import { BellRing, CreditCard, Route, ShieldCheck } from 'lucide-react';

const Services = () => {
  const features = [
    {
      icon: CreditCard,
      title: 'ရှင်းလင်းသော Booking Flow',
      description: 'ခရီးစဉ်၊ coach၊ seat နှင့် fare ကို အဆင့်လိုက်ကြည့်ပြီး reservationကို ဆောင်ရွက်နိုင်ပါသည်။',
    },
    {
      icon: BellRing,
      title: 'Status Change Notification',
      description: 'ရထားစတင်ပြေးဆွဲမှုနှင့် ဘူတာဆိုက်ရောက်/ထွက်ခွာ ပြောင်းလဲမှုများကို အသိပေးပါသည်။',
    },
    {
      icon: Route,
      title: 'Live Journey Context',
      description: 'ACTIVE ဖြစ်သောအခါ လက်ရှိဘူတာ၊ နောက်တစ်ဘူတာ၊ delay၊ progress နှင့် passenger journey ကို ကြည့်နိုင်ပါသည်။',
    },
    {
      icon: ShieldCheck,
      title: 'Passenger-first Access',
      description: 'လက်မှတ်စစ်ဆေးခြင်းနှင့် booking ပြုလုပ်ခြင်းအတွက် passenger account မဖြစ်မနေလိုအပ်ခြင်း မရှိပါ။',
    },
  ];

  return (
    <section className=" px-4 py-14 text-white sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl text-left">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-sky-400">Passenger Experience</p>
          <h2 className="mt-3 mb-0 text-2xl font-bold text-blue-200 sm:text-3xl">ခရီးသည်အတွက် လိုအပ်တာကို ရိုးရှင်းစွာ</h2>
          {/* <p className="mt-3 text-sm leading-7 text-slate-400 sm:text-base">မလိုအပ်သော marketing sections များထက် booking၊ status နှင့် live operation information ကို အဓိကထားပြထားပါသည်။</p> */}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-400">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Services;
