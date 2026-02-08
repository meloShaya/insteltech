import React, { useState } from 'react';
import { 
  ArrowRight, 
  Zap, 
  FileText, 
  Download, 
  CheckCircle2, 
  Search,
  Play,
  Star,
  ChevronDown,
  ChevronUp,
  Layout,
  MousePointer2,
  PieChart,
  ShieldCheck,
  Users,
  XCircle,
  TrendingUp,
  Palette,
  DollarSign
} from 'lucide-react';

// --- Utility Components ---

const Button = ({ children, variant = 'primary', className = '', onClick }: { children: React.ReactNode, variant?: 'primary' | 'secondary' | 'black', className?: string, onClick?: () => void }) => {
  const baseStyle = "px-6 py-3 md:px-8 md:py-4 font-bold text-lg md:text-xl border-2 border-slate-900 transition-all duration-200 flex items-center justify-center gap-2 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none rounded-lg";
  
  const variants = {
    primary: "bg-[#2563eb] text-white shadow-[4px_4px_0px_0px_#0f172a] hover:bg-[#1d4ed8] hover:shadow-[6px_6px_0px_0px_#0f172a] hover:-translate-y-1",
    secondary: "bg-white text-slate-900 shadow-[4px_4px_0px_0px_#0f172a] hover:bg-slate-50 hover:shadow-[6px_6px_0px_0px_#0f172a] hover:-translate-y-1",
    black: "bg-slate-900 text-white shadow-[4px_4px_0px_0px_#94a3b8] hover:bg-slate-800 hover:shadow-[6px_6px_0px_0px_#94a3b8] hover:-translate-y-1"
  };

  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant as keyof typeof variants] || variants.primary} ${className}`}>
      {children}
    </button>
  );
};

const Badge = ({ children }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-100 mb-6 uppercase tracking-wider">
    {children}
  </span>
);

const SectionHeading = ({ title, subtitle, center = true }) => (
  <div className={`mb-16 ${center ? 'text-center' : ''}`}>
    <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
      {title}
    </h2>
    <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
      {subtitle}
    </p>
  </div>
);

// --- Sub-Components ---

const FeaturePill = ({ icon: Icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`
      flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-300
      ${isActive 
        ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200 shadow-sm scale-105' 
        : 'bg-white text-slate-500 hover:bg-slate-50 border border-transparent'}
    `}
  >
    <span className="text-lg opacity-70">/</span>
    {label}
  </button>
);

const PricingCard = ({ title, price, description, features, highlighted = false, onClick }: { title: string, price: string, description: string, features: string[], highlighted?: boolean, onClick?: () => void }) => (
  <div className={`
    p-8 rounded-3xl border transition-all duration-300
    ${highlighted 
      ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900 shadow-2xl shadow-blue-900/10 ring-1 ring-blue-100 dark:ring-blue-900 relative overflow-hidden' 
      : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none'}
  `}>
    {highlighted && (
      <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl">
        POPULAR
      </div>
    )}
    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
    <div className="mb-4">
      <span className="text-4xl font-bold text-slate-900 dark:text-white">{price}</span>
      {price !== 'Free' && !price.includes('%') && <span className="text-slate-500 dark:text-slate-400 text-sm">/mo</span>}
    </div>
    <p className="text-slate-500 dark:text-slate-400 text-sm mb-8 leading-relaxed">{description}</p>
    <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full mb-8" onClick={onClick}>
      {highlighted ? 'Start Selling' : 'Browse Only'}
    </Button>
    <ul className="space-y-3">
      {features.map((feat, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <CheckCircle2 size={16} className={`mt-0.5 ${highlighted ? 'text-blue-600' : 'text-slate-400'}`} />
          {feat}
        </li>
      ))}
    </ul>
  </div>
);

const FaqItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button 
        className="w-full flex items-center justify-between py-6 text-left hover:text-blue-600 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-slate-900 dark:text-white text-lg">{question}</span>
        {isOpen ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
      </button>
      {isOpen && (
        <div className="pb-6 text-slate-500 dark:text-slate-400 leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

interface AboutPageProps {
  onNavigate: (page: string) => void;
}

export const AboutPage = ({ onNavigate }: AboutPageProps) => {
  const [activeTab, setActiveTab] = useState('ebooks');
  
  const handleBrowse = () => onNavigate('marketplace');
  const handleSell = () => onNavigate('seller');

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 font-sans text-slate-900 dark:text-white selection:bg-blue-100 selection:text-blue-900">
      
      {/* 1. Header / Hero Section */}
      <section className="pt-12 pb-32 px-4 bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900 dark:to-slate-900">
        <div className="max-w-7xl mx-auto text-center">
          
          <Badge>
             Market Size: $77.3bn Opportunity • 100% White Label
          </Badge>

          <h1 className="text-5xl md:text-7xl font-bold text-slate-900 dark:text-white mb-8 tracking-tight leading-none">
            The first marketplace for<br />
            White Label Lead Magnets.
          </h1>
          
          <p className="text-xl text-slate-500 dark:text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Stop building from scratch. Buy proven ebooks, templates, and checklists. Customize them. Grow your list.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
            <Button variant="primary" className="text-lg px-8 py-4" onClick={handleBrowse}>
              Browse Lead Magnets <ArrowRight size={18} />
            </Button>
            <Button variant="secondary" className="text-lg px-8 py-4" onClick={handleSell}>
              Sell Your Assets
            </Button>
          </div>

          {/* Hero UI Mockup */}
          <div className="relative max-w-5xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden aspect-[16/9] relative group">
              {/* Fake UI Header */}
              <div className="h-12 border-b border-slate-100 dark:border-slate-700 flex items-center px-6 gap-2 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/20 border border-red-400/50"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400/20 border border-amber-400/50"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400/20 border border-green-400/50"></div>
                </div>
                <div className="ml-4 px-3 py-1 bg-white dark:bg-slate-800 rounded-md text-xs text-slate-400 border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-2">
                  <Search size={10} />
                  magnethub.com/browse
                </div>
              </div>
              
              {/* Fake UI Body */}
              <div className="p-8 grid grid-cols-12 gap-6 h-full bg-slate-50/30 dark:bg-slate-900/30 text-left">
                 {/* Sidebar */}
                 <div className="col-span-3 space-y-4">
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse"></div>
                    <div className="h-4 w-20 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse"></div>
                    <div className="h-4 w-12 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse"></div>
                 </div>
                 {/* Main Content */}
                 <div className="col-span-9">
                    <div className="flex justify-between items-center mb-8">
                       <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                       <div className="h-8 w-24 bg-blue-100 dark:bg-blue-900/30 rounded animate-pulse"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                       <div className="aspect-[4/3] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
                          <div className="w-full h-2/3 bg-slate-100 dark:bg-slate-700 rounded-lg mb-4"></div>
                          <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                          <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-700/50 rounded"></div>
                       </div>
                       <div className="aspect-[4/3] bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-4">
                          <div className="w-full h-2/3 bg-slate-100 dark:bg-slate-700 rounded-lg mb-4"></div>
                          <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                          <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-700/50 rounded"></div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Overlay Content based on tab */}
              <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-slate-900/40 backdrop-blur-[2px]">
                 <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 max-w-md text-center">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600 dark:text-blue-400">
                       <FileText />
                    </div>
                    <h3 className="text-xl font-bold mb-2 capitalize text-slate-900 dark:text-white">Marketplace Ready</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Browse 5,000+ white-label assets ready to customize and sell.</p>
                    <Button onClick={handleBrowse}>View Assets</Button>
                 </div>
              </div>
            </div>
            
            {/* Background Glow */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-[2.5rem] blur-2xl opacity-10 -z-10"></div>
          </div>
        </div>
      </section>

      {/* 2. All You Need To Automate (Restored Design Grid) */}
      <section className="py-24 px-4 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto">
          <SectionHeading 
            title="Magnets are hard. We make them easy." 
            subtitle="Creating high-quality assets takes weeks. Most marketers give up or ship something terrible that converts at 0%. We fixed that."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-auto">
            
            {/* 1. Large Wide Card (The MagnetHub Way) */}
            <div className="col-span-1 md:col-span-2 bg-slate-50 dark:bg-slate-800 rounded-[2rem] p-8 md:p-12 border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
              <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-700 rounded-full text-xs font-bold text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 mb-6">
                    <CheckCircle2 size={12} /> The MagnetHub Way
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
                     Browse. Brand. Launch.
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    Browse proven assets. Buy White Label rights. Add your branding. Launch in minutes. No design skills required.
                  </p>
                  <Button variant="primary" onClick={handleBrowse}>Browse Marketplace</Button>
                </div>
                {/* Visual - Reusing the "Extension" visual style from original code */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 transform rotate-3 group-hover:rotate-0 transition-all duration-500">
                  <div className="flex items-center gap-3 border-b border-slate-50 dark:border-slate-800 pb-4 mb-4">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <Zap size={16} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white">MagnetHub Lead Marketplace</p>
                        <p className="text-xs text-slate-400">Rebranding assistant</p>
                      </div>
                  </div>
                  <div className="space-y-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400">
                        Importing "SaaS Growth Guide"...
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm border border-blue-100 dark:border-blue-800">
                        <span className="font-bold">Your Logo</span> applied to all 42 pages.
                      </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Small Left Card (The Old Way) */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 border border-slate-100 dark:border-slate-700 shadow-lg shadow-slate-200/50 dark:shadow-none flex flex-col justify-between">
              <div>
                <div className="flex gap-4 mb-8">
                  <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center text-rose-500"><XCircle size={20} /></div>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">The Old Way</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">
                  Write 50 pages. Design in Canva. Pray.
                </p>
                <p className="text-slate-400 dark:text-slate-500 text-xs leading-relaxed">
                  Most marketers ship terrible lead magnets that convert at 0% because they don't have the time or skills to build premium assets.
                </p>
              </div>
            </div>

            {/* 3. Small Right Card (For Creators) */}
            <div className="bg-[#fff1f2] dark:bg-rose-950/20 rounded-[2rem] p-8 border border-rose-100 dark:border-rose-900/50 shadow-lg shadow-rose-200/50 dark:shadow-none flex flex-col justify-between relative overflow-hidden">
               <div className="relative z-10">
                  <div className="w-full bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-xl p-4 mb-6 border border-white/50 dark:border-slate-700/50">
                     <div className="flex justify-between items-center text-sm font-bold text-rose-900 dark:text-rose-300 mb-2">
                        <span>Passive Income</span>
                        <span>$2,450</span>
                     </div>
                     <div className="w-full bg-rose-100 dark:bg-rose-900/50 h-2 rounded-full overflow-hidden">
                        <div className="bg-rose-500 h-full w-[75%]"></div>
                     </div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">For Creators</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
                     Monetize your marketing brain. Sell your proven templates to other marketers.
                  </p>
                  <Button variant="primary" className="w-full text-sm py-2" onClick={handleSell}>Start Selling</Button>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Pricing / Business Model */}
      <section className="py-24 px-4 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto">
          <SectionHeading 
            title="Simple & Transparent" 
            subtitle="Stop paying monthly subscriptions for tools you barely use. Pay once, own forever."
          />

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {/* Competitor Card */}
            <PricingCard 
              title="Competitors"
              price="$99"
              description="Monthly subscription for generic PLR sites."
              features={[
                "Recurring monthly fees",
                "Low quality outdated content",
                "No customization tools",
                "Limited support"
              ]}
              onClick={handleBrowse}
            />

            {/* MagnetHub Card - Highlighted */}
            <PricingCard 
              title="MagnetHub"
              price="$0"
              description="No monthly fees. You only pay for what you buy."
              highlighted={true}
              features={[
                "Pay per asset",
                "0% Monthly Fees",
                "High-quality vetted creators",
                "Free customization tools",
                "Commercial License included"
              ]}
              onClick={handleSell}
            />

            {/* Sellers Card */}
            <PricingCard 
              title="Sellers"
              price="20%"
              description="Commission on sales. Free to list your assets."
              features={[
                "Unlimited listings",
                "Global payments handling",
                "Fraud protection",
                "Marketing included"
              ]}
              onClick={handleSell}
            />
          </div>
        </div>
      </section>

      {/* 4. FAQ */}
      <section className="py-24 px-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-3xl mx-auto">
           <h2 className="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-white">Frequently Asked Questions</h2>
           <div className="space-y-2">
              <FaqItem 
                question="What does 'White Label' mean?" 
                answer="It means you can legally remove the original creator's name, add your own logo, brand name, and website, and sell or give away the product as if you created it yourself."
              />
              <FaqItem 
                question="Are there really no monthly fees?" 
                answer="Correct. We are a transactional marketplace. If you are buying, you pay the price listed. If you are selling, we take a 20% commission on the sale. No hidden subscriptions."
              />
              <FaqItem 
                question="Can I resell the assets?" 
                answer="Yes! That is the entire point. You can resell them as PDF/Courses to your audience. However, you cannot resell the 'source files' (the rights) to other marketers."
              />
              <FaqItem 
                question="What formats are included?" 
                answer="Most assets come with a PDF for immediate use, and editable source files like Canva links, Notion duplicates, or Google Doc links."
              />
           </div>
        </div>
      </section>

      {/* 5. Footer CTA Banner (Navy Background, No Footer Links) */}
      <section className="px-4 pb-12 pt-0 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="relative rounded-[3rem] overflow-hidden px-8 py-24 text-center bg-[#0f172a] shadow-2xl shadow-slate-900/20">
            {/* Background Image / Texture */}
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')] opacity-10 bg-cover bg-center mix-blend-overlay"></div>
            
            {/* Content */}
            <div className="relative z-10 max-w-3xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
                Ready to fill your funnel?
              </h2>
              <p className="text-lg text-slate-300 mb-10">
                 Join thousands of marketers using proven assets to grow faster.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                 <Button variant="black" className="px-8 py-4 text-lg" onClick={handleBrowse}>
                    Find a Magnet
                 </Button>
                 <Button variant="secondary" className="px-8 py-4 text-lg" onClick={handleSell}>
                    Sell a Magnet
                 </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
