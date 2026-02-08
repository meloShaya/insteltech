import React, { useEffect, useState } from 'react';
import { 
  Search, TrendingUp, Star, ArrowUpRight, 
  Zap, Award, ChevronUp, MessageSquare, 
  Flame, CheckCircle2, Menu, Calendar, Clock, Rocket
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';

interface LandingPageProps {
  onBrowseMarketplace: () => void;
  onNavigate: (page: string, productId?: string) => void;
}

const Marquee = ({ text, repeat = 10 }: { text: string, repeat?: number }) => (
  <div className="bg-slate-900 dark:bg-slate-950 text-white py-2 overflow-hidden whitespace-nowrap">
    <div className="animate-marquee inline-block">
      {[...Array(repeat)].map((_, i) => (
        <span key={i} className="mx-4 text-xs md:text-sm font-mono font-bold uppercase tracking-widest">
          {text} <span className="text-blue-500">★</span>
        </span>
      ))}
    </div>
  </div>
);

interface Testimonial {
  id: string;
  name: string;
  role: string;
  image: string;
  quote: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    role: 'Digital Creator',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=600&fit=crop&q=80',
    quote: "MagnetHub helped me double my email list in just 30 days."
  },
  {
    id: '2',
    name: 'Marcus Johnson',
    role: 'SaaS Founder',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=600&fit=crop&q=80',
    quote: "The quality of templates here is unmatched. Saved me weeks of work."
  },
  {
    id: '3',
    name: 'Emma Davis',
    role: 'Marketing Lead',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&q=80',
    quote: "Finally a marketplace that understands what marketers actually need."
  },
  {
    id: '4',
    name: 'Alex Rivera',
    role: 'Growth Hacker',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=600&fit=crop&q=80',
    quote: "Best investment for my agency this year. Highly recommended!"
  },
  {
    id: '5',
    name: 'Jessica Wu',
    role: 'Content Strategist',
    image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&q=80',
    quote: "I've bought 5 packs already. The ROI is insane."
  }
];

const TestimonialsList = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 px-2">
      <MessageSquare className="w-4 h-4 text-slate-400" />
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Community Love</span>
    </div>
    
    <div className="space-y-6">
      {TESTIMONIALS.map((testimonial) => (
        <div 
          key={testimonial.id}
          className="relative group rounded-2xl overflow-hidden h-48 shadow-md hover:shadow-xl transition-all duration-300"
        >
          <img 
            src={testimonial.image} 
            alt={testimonial.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-90" />
          
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <div className="flex items-center gap-1 mb-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="w-3 h-3 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs font-medium leading-relaxed mb-2 text-slate-100 line-clamp-2">
              "{testimonial.quote}"
            </p>
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-blue-500 rounded-full"></div>
              <div>
                <p className="font-bold text-xs">{testimonial.name}</p>
                <p className="text-[10px] text-slate-400">{testimonial.role}</p>
              </div>
            </div>
          </div>

          {/* Play Button Overlay (Decorative) */}
          <div className="absolute top-4 right-4 w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform">
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-white border-b-[5px] border-b-transparent ml-1"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const LandingPage = ({ onBrowseMarketplace, onNavigate }: LandingPageProps) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [userUpvotes, setUserUpvotes] = useState<Set<string>>(new Set());
  const [upvoting, setUpvoting] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
    if (user) {
      loadUserUpvotes();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('products')
          .select(`
            *,
            category:categories(name),
            seller:profiles(full_name)
          `)
          .is('deleted_at', null)
          .order('upvote_count', { ascending: false }),
        supabase
          .from('categories')
          .select('*')
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts(productsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserUpvotes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('product_upvotes')
        .select('product_id')
        .eq('user_id', user.id);

      if (error) throw error;

      const upvotedIds = new Set(data?.map(item => item.product_id) || []);
      setUserUpvotes(upvotedIds);
    } catch (error) {
      console.error('Error loading user upvotes:', error);
    }
  };

  const handleUpvote = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!user) {
      onNavigate('auth', undefined);
      return;
    }

    if (upvoting.has(productId)) return;

    setUpvoting(prev => new Set(prev).add(productId));

    try {
      const { data, error } = await supabase.rpc('toggle_product_upvote', {
        p_product_id: productId,
        p_user_id: user.id,
      });

      if (error) throw error;

      const isUpvoted = data as boolean;

      setUserUpvotes(prev => {
        const newSet = new Set(prev);
        if (isUpvoted) {
          newSet.add(productId);
        } else {
          newSet.delete(productId);
        }
        return newSet;
      });

      setProducts(prev => prev.map(p => {
        if (p.id === productId) {
          return {
            ...p,
            upvote_count: isUpvoted ? (p.upvote_count || 0) + 1 : Math.max((p.upvote_count || 0) - 1, 0)
          };
        }
        return p;
      }));
    } catch (error) {
      console.error('Error toggling upvote:', error);
    } finally {
      setUpvoting(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const handleBuyProduct = (productId: string) => {
    onNavigate('product', productId);
  };

  // Filter products based on category and search query
  const filteredProducts = products.filter(product => {
    const matchesCategory = activeCategory === 'All' || product.category?.name === activeCategory;
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredProduct = filteredProducts[0];
  const leaderboardProducts = filteredProducts.slice(1, 11);
  const topDeals = products.slice(0, 3); // Keep top deals static or random for now

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 font-sans text-slate-900 dark:text-white overflow-x-hidden transition-colors">
      {/* Marquee Header */}
      <Marquee text="eBooks • Notion Templates • Checklists • Webinars • Email Courses •" />
      
      {/* Search & Auth Header */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 transition-colors">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center text-white font-bold">
              M
            </div>
            <span className="font-bold text-xl tracking-tight hidden md:block">MagnetHub</span>
          </div>
          
          <div className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search products..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 transition-all"
            />
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!user ? (
              <Button onClick={() => onNavigate('auth', undefined)} variant="secondary" className="!py-2 !px-4 !text-sm whitespace-nowrap">
                Sign In
              </Button>
            ) : (
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden border border-blue-200 dark:border-blue-800">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} alt="Profile" />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1700px] mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Sidebar (Hero Info) - Desktop: Col 1-3 */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm lg:sticky lg:top-24 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                   <Award className="w-5 h-5 text-amber-500" />
                </div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">#1 Marketplace</span>
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4 leading-tight">
                The first marketplace for White Label Lead Magnets.
              </h2>
              
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
                Buy proven ebooks, templates, and checklists. Customize them. Generate leads and Grow your list.
              </p>

              <div className="space-y-4 text-sm text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Rocket className="w-4 h-4" />
                  <span>{products.length} products listed</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>40.6K monthly visitors</span>
                </div>
              </div>
            </div>

            {/* Testimonials (Desktop Only) */}
            <div className="hidden lg:block">
              <TestimonialsList />
            </div>
          </aside>

          {/* Main Content - Leaderboard - Desktop: Col 4-9 */}
          <div className="lg:col-span-6 space-y-8 min-w-0">
            
            {/* Hero / Featured Product of the Day */}
            {featuredProduct && (
              <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-1 shadow-xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2"></div>
                
                <div className="bg-slate-900/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-[20px] p-6 relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider rounded-full border border-blue-500/20 flex items-center gap-1">
                      <Award className="w-3 h-3" /> Product of the Day
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    <div 
                      className="w-full sm:w-24 h-48 sm:h-24 rounded-2xl overflow-hidden bg-slate-800 shadow-lg border border-slate-700 shrink-0 cursor-pointer"
                      onClick={() => handleBuyProduct(featuredProduct.id)}
                    >
                      <img 
                        src={featuredProduct.thumbnail_url} 
                        alt={featuredProduct.title} 
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    
                    <div className="flex-1 w-full min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <h2 
                          className="text-xl sm:text-2xl font-bold leading-tight cursor-pointer hover:text-blue-400 transition-colors truncate"
                          onClick={() => handleBuyProduct(featuredProduct.id)}
                        >
                          {featuredProduct.title}
                        </h2>
                      </div>
                      
                      <p className="text-slate-400 text-sm sm:text-base mb-4 line-clamp-2">
                        {featuredProduct.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button 
                          onClick={() => handleBuyProduct(featuredProduct.id)}
                          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white border-none shadow-lg shadow-blue-900/20 py-2 px-4 text-sm"
                        >
                          Buy Product <ArrowUpRight className="w-4 h-4 ml-2" />
                        </Button>
                        
                        <button
                          onClick={(e) => handleUpvote(featuredProduct.id, e)}
                          disabled={upvoting.has(featuredProduct.id)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-all ${
                            userUpvotes.has(featuredProduct.id)
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-white/10 text-slate-400 hover:bg-white/20'
                          } ${upvoting.has(featuredProduct.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <ChevronUp className="w-4 h-4" />
                          <span className="font-bold">{featuredProduct.upvote_count || 0}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leaderboard Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
              <button
                onClick={() => setActiveCategory('All')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  activeCategory === 'All'
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-md' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                    activeCategory === cat.name 
                      ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-md' 
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Leaderboard List */}
            <div className="space-y-4">
              {leaderboardProducts.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">No products found matching your criteria.</p>
                </div>
              ) : (
                leaderboardProducts.map((product, index) => (
                  <div 
                    key={product.id}
                    className="group bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-blue-100 dark:hover:border-blue-900 rounded-2xl p-4 transition-all hover:shadow-lg hover:shadow-blue-500/5 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
                  >
                    <div className="flex items-center gap-4 flex-1 w-full min-w-0">
                      <span className="text-lg font-bold text-slate-300 dark:text-slate-600 w-6 text-center font-mono hidden sm:block shrink-0">
                        #{index + 2}
                      </span>
                      
                      <div 
                        className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shrink-0 cursor-pointer"
                        onClick={() => handleBuyProduct(product.id)}
                      >
                        <img 
                          src={product.thumbnail_url} 
                          alt={product.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 
                            className="font-bold text-base text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer max-w-full"
                            onClick={() => handleBuyProduct(product.id)}
                          >
                            {product.title}
                          </h3>
                          {product.conversion_rate > 20 && (
                            <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wide rounded-full flex items-center gap-1 shrink-0">
                              <Flame className="w-3 h-3" /> Hot
                            </span>
                          )}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-1 mb-2">
                          {product.description}
                        </p>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-medium truncate max-w-[100px]">
                            {product.category?.name || 'Product'}
                          </span>
                          <div className="flex items-center gap-1 text-slate-400 shrink-0">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span>{product.rating_average?.toFixed(1) || 'New'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <button
                        onClick={(e) => handleUpvote(product.id, e)}
                        disabled={upvoting.has(product.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all text-xs font-bold border ${
                          userUpvotes.has(product.id)
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        } ${upvoting.has(product.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <ChevronUp className="w-3 h-3" />
                        <span>{product.upvote_count || 0}</span>
                      </button>

                      <Button
                        onClick={() => handleBuyProduct(product.id)}
                        variant="secondary"
                        className="w-full sm:w-auto !py-2 !px-4 text-sm font-bold border-2 border-slate-100 dark:border-slate-700 hover:border-blue-600 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-500 transition-all whitespace-nowrap bg-transparent dark:text-white"
                      >
                        Buy ${product.price}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="flex justify-center pt-8">
              <Button onClick={onBrowseMarketplace} variant="secondary" className="w-full sm:w-auto">
                View All Products
              </Button>
            </div>
          </div>

          {/* Right Sidebar - Desktop: Col 10-12 */}
          <aside className="lg:col-span-3 space-y-8">
            {/* Top Deals */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 fill-amber-500" /> Top Deals
                </h3>
                <button onClick={onBrowseMarketplace} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">View all</button>
              </div>
              
              <div className="space-y-5">
                {topDeals.map((product) => (
                  <div key={product.id} className="flex items-start gap-3 group cursor-pointer" onClick={() => handleBuyProduct(product.id)}>
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                      <img 
                        src={product.thumbnail_url} 
                        alt={product.title} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {product.title}
                      </h4>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[80px]">{product.category?.name}</span>
                        <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded shrink-0">
                          -20%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Featured / Newsletter */}
            <div className="bg-slate-900 dark:bg-slate-950 text-white rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600 rounded-full mix-blend-overlay filter blur-2xl opacity-50 -translate-y-1/2 translate-x-1/2"></div>
              
              <h3 className="font-bold text-lg mb-2 relative z-10">Submit Your Asset</h3>
              <p className="text-slate-400 text-sm mb-6 relative z-10">
                Got a killer template or ebook? List it on MagnetHub and reach thousands of marketers.
              </p>
              
              <Button 
                onClick={() => onNavigate('seller', undefined)}
                variant="secondary"
                className="w-full bg-white text-slate-900 hover:bg-blue-50 border-none relative z-10"
              >
                Start Selling
              </Button>
            </div>

            {/* Trending Categories */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Trending Categories</h3>
              <div className="flex flex-wrap gap-2">
                {categories.slice(0, 8).map((cat) => (
                  <span 
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.name)}
                    className="px-3 py-1 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg cursor-pointer transition-colors border border-slate-100 dark:border-slate-700"
                  >
                    {cat.name}
                  </span>
                ))}
              </div>
            </div>
           
          </aside>

          {/* Testimonials (Mobile Only - Bottom) */}
          <div className="lg:hidden col-span-1">
            <TestimonialsList />
          </div>
        </div>
      </div>

      {/* Global Styles for Custom Animations */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default LandingPage;