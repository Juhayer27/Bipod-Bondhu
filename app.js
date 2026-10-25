'use strict';
// Public client configuration only. Never put a service-role or secret key in this file.
const SUPABASE_URL = 'https://reiamgegvfmngufnqgyz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DrMG79CaJI_i2v-x4V47OA_5cB0WDx4';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CAT = {blood:'রক্ত', emergency:'জরুরি সহায়তা', food:'খাদ্য', shelter:'আশ্রয়', medical:'চিকিৎসা সহায়তা', volunteer:'স্বেচ্ছাসেবা', other:'অন্যান্য'};
const URG = {normal:'সাধারণ', urgent:'জরুরি', critical:'অতি জরুরি'};
const ST = {pending:'পর্যালোচনায়', active:'সক্রিয়', fulfilled:'সম্পন্ন', rejected:'বাতিল', expired:'মেয়াদোত্তীর্ণ'};
const VER = {unverified:'পরিচয় যাচাই হয়নি', pending:'যাচাই অপেক্ষমাণ', verified:'যাচাইকৃত'};
const BG = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const DIST = "Bagerhat,Bandarban,Barguna,Barishal,Bhola,Bogura,Brahmanbaria,Chandpur,Chapainawabganj,Chattogram,Chuadanga,Cumilla,Cox's Bazar,Dhaka,Dinajpur,Faridpur,Feni,Gaibandha,Gazipur,Gopalganj,Habiganj,Jamalpur,Jashore,Jhalakathi,Jhenaidah,Joypurhat,Khagrachhari,Khulna,Kishoreganj,Kurigram,Kushtia,Lakshmipur,Lalmonirhat,Madaripur,Magura,Manikganj,Meherpur,Moulvibazar,Munshiganj,Mymensingh,Naogaon,Narail,Narayanganj,Narsingdi,Natore,Netrokona,Nilphamari,Noakhali,Pabna,Panchagarh,Patuakhali,Pirojpur,Rajbari,Rajshahi,Rangamati,Rangpur,Satkhira,Shariatpur,Sherpur,Sirajganj,Sunamganj,Sylhet,Tangail,Thakurgaon".split(',');

let user = null, page = 0;

function fill(sel, items, map) {
  for (const v of items) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = map ? map[v] : v;
    sel.appendChild(o);
  }
}

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.style.display = 'none'; }, 5000);
}

function msg(e) {
  const m = (e && e.message) || String(e);
  const k = {
    rate_limit: 'সীমা পেরিয়ে গেছে (২৪ ঘণ্টায় সর্বোচ্চ ৫টি অনুরোধ)। পরে চেষ্টা করুন।',
    needed_by_invalid: 'তারিখ আজ থেকে ৩০ দিনের মধ্যে হতে হবে।',
    'duplicate key': 'এই একই অনুরোধ ইতিমধ্যে সক্রিয় আছে।',
    'Invalid login': 'ইমেইল বা পাসওয়ার্ড ভুল।',
    'Email not confirmed': 'আগে ইমেইল যাচাই করুন।',
    'rate limit': 'ইমেইল পাঠানোর সীমা পেরিয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।'
  };
  for (const x in k) if (m.includes(x)) return k[x];
  return 'ত্রুটি হয়েছে: ' + m;
}

function route() {
  const h = (location.hash || '#home').slice(1);
  ['home', 'posts', 'request', 'account'].forEach(v => { $('#v-' + v).hidden = v !== h; });
  if (h === 'posts') loadPosts(true);
  if (h === 'account') loadMine();
  if (h === 'request') $('#rlogin').hidden = !!user;
  window.scrollTo(0, 0);
}

function setUser(u) {
  user = u;
  $('#navacc').textContent = u ? 'অ্যাকাউন্ট' : 'লগইন';
  $('#out').hidden = !!u;
  $('#inn').hidden = !u;
  route();
}

async function loadPosts(reset) {
  if (reset) { page = 0; $('#plist').innerHTML = ''; }
  const q0 = $('#fq').value.trim().replace(/[%,()*]/g, '');
  let q = sb.from('public_help_posts').select('*').eq('status', 'active')
    .order('created_at', {ascending: false}).range(page * 10, page * 10 + 9);
  if ($('#fcat').value) q = q.eq('category', $('#fcat').value);
  if ($('#fdist').value) q = q.eq('district', $('#fdist').value);
  if (q0) q = q.or('details.ilike.%' + q0 + '%,hospital_name.ilike.%' + q0 + '%,area.ilike.%' + q0 + '%');
  const {data, error} = await q;
  if (error) return toast(msg(error));
  for (const p of data) $('#plist').insertAdjacentHTML('beforeend', card(p, false));
  $('#pempty').hidden = page > 0 || data.length > 0;
  $('#pmore').hidden = data.length < 10;
  page++;
}

function card(p, mine) {
  const id = esc(p.id);
  let actions;
  if (mine) {
    actions = (p.status === 'active' ? '<button class="ghost" data-act="done" data-id="' + id + '">সম্পন্ন চিহ্নিত করুন</button> ' : '') +
      '<button class="red" data-act="del" data-id="' + id + '">মুছে ফেলুন</button>';
  } else if (p.is_mine) {
    actions = '<span class="tag">আপনার পোস্ট</span>';
  } else {
    actions = '<button class="ghost" data-act="rep" data-id="' + id + '">রিপোর্ট করুন</button>';
  }
  return '<article class="card ' + esc(p.urgency) + '">' +
    '<span class="tag">' + esc(CAT[p.category]) + '</span>' +
    (p.blood_group ? '<span class="tag">' + esc(p.blood_group) + (p.units_needed ? ' · ' + esc(p.units_needed) + ' ব্যাগ' : '') + '</span>' : '') +
    '<span class="tag">' + esc(URG[p.urgency]) + '</span>' +
    (mine ? '<span class="tag">' + esc(ST[p.status]) + '</span>' : '') +
    '<p>' + esc(p.details) + '</p>' +
    '<div class="muted">' + esc(p.district) + (p.area ? ', ' + esc(p.area) : '') + (p.hospital_name ? ' · ' + esc(p.hospital_name) : '') + ' · প্রয়োজন: ' + esc(p.needed_by) + '</div>' +
    '<div class="muted">অনুরোধকারী: ' + esc(p.requester_name || '—') + (p.requester_verified ? ' <span class="tag v">যাচাইকৃত</span>' : '') + '</div>' +
    actions + '</article>';
}

async function loadMine() {
  if (!user) return;
  $('#who').textContent = user.email;
  const {data: pr} = await sb.from('profiles').select('display_name,verification_status').eq('id', user.id).maybeSingle();
  if (pr) {
    $('#who').textContent = pr.display_name + ' (' + user.email + ')';
    $('#vstat').textContent = VER[pr.verification_status];
  }
  const {data, error} = await sb.from('public_help_posts').select('*').eq('is_mine', true).order('created_at', {ascending: false});
  if (error) return toast(msg(error));
  $('#mine').innerHTML = data.map(p => card(p, true)).join('');
  $('#mempty').hidden = data.length > 0;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.dataset.id, a = b.dataset.act;
  if (a === 'del') {
    if (!confirm('এই পোস্ট স্থায়ীভাবে মুছে ফেলবেন?')) return;
    const {error} = await sb.from('help_requests').delete().eq('id', id);
    if (error) return toast(msg(error));
    toast('পোস্ট মুছে ফেলা হয়েছে।');
    loadMine();
  } else if (a === 'done') {
    if (!confirm('অনুরোধটি সম্পন্ন হিসেবে চিহ্নিত করবেন?')) return;
    const {error} = await sb.from('help_requests').update({status: 'fulfilled'}).eq('id', id);
    if (error) return toast(msg(error));
    toast('সম্পন্ন চিহ্নিত হয়েছে।');
    loadMine();
  } else if (a === 'rep') {
    if (!user) { location.hash = '#account'; return toast('রিপোর্ট করতে লগইন করুন।'); }
    if (!confirm('এই পোস্টটি রিপোর্ট করবেন? (ভুয়া, স্প্যাম বা গোপনীয়তা লঙ্ঘন)')) return;
    const {error} = await sb.from('reports').insert({reporter_id: user.id, request_id: id, reason: 'other'});
    toast(error ? (error.message.includes('duplicate') ? 'আপনি ইতিমধ্যে রিপোর্ট করেছেন।' : msg(error)) : 'রিপোর্ট জমা হয়েছে। ধন্যবাদ।');
  }
});

$('#fgo').onclick = () => loadPosts(true);
$('#pmore').onclick = () => loadPosts(false);

$('#fauth').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target), m = e.submitter.value, email = f.get('email'), pw = f.get('password');
  e.submitter.disabled = true;
  try {
    if (m === 'in') {
      const {error} = await sb.auth.signInWithPassword({email, password: pw});
      if (error) throw error;
      toast('লগইন সফল হয়েছে।');
    } else if (m === 'up') {
      const n = (f.get('name') || '').trim();
      if (n.length < 2) throw new Error('নাম কমপক্ষে ২ অক্ষরের দিন।');
      const {data, error} = await sb.auth.signUp({email, password: pw, options: {data: {display_name: n}, emailRedirectTo: location.origin}});
      if (error) throw error;
      toast(data.session ? 'অ্যাকাউন্ট তৈরি হয়েছে।' : 'ইমেইলে যাচাইয়ের লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর লগইন করুন।');
    } else {
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin});
      if (error) throw error;
      toast('ইমেইল নিবন্ধিত থাকলে পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।');
    }
  } catch (x) {
    toast(msg(x));
  }
  e.submitter.disabled = false;
};

$('#frecov').onsubmit = async e => {
  e.preventDefault();
  const np = new FormData(e.target).get('np');
  const {error} = await sb.auth.updateUser({password: np});
  if (error) return toast(msg(error));
  e.target.reset();
  e.target.hidden = true;
  toast('পাসওয়ার্ড বদলানো হয়েছে।');
};

$('#logout').onclick = async () => {
  await sb.auth.signOut();
  toast('লগ আউট হয়েছে।');
};

$('#rcat').onchange = e => { $('#rblood').hidden = e.target.value !== 'blood'; };

$('#freq').onsubmit = async e => {
  e.preventDefault();
  if (!user) { location.hash = '#account'; return toast('আগে লগইন করুন।'); }
  const f = new FormData(e.target), b = e.submitter, c = f.get('category'), d = (f.get('details') || '').trim();
  if (c === 'blood' && !f.get('bg')) return toast('রক্তের গ্রুপ নির্বাচন করুন।');
  if (d.length < 10) return toast('বিবরণ কমপক্ষে ১০ অক্ষর দিন।');
  if (/(\+?88)?01[3-9][0-9]{8}/.test(d.replace(/[\s-]/g, ''))) return toast('বিবরণে ফোন নম্বর লিখবেন না।');
  b.disabled = true;
  const {error} = await sb.from('help_requests').insert({
    user_id: user.id,
    category: c,
    blood_group: c === 'blood' ? f.get('bg') : null,
    units_needed: f.get('units') ? +f.get('units') : null,
    urgency: f.get('urgency'),
    needed_by: f.get('needed_by'),
    hospital_name: f.get('hospital') || null,
    district: f.get('district'),
    area: f.get('area') || null,
    details: d
  });
  b.disabled = false;
  if (error) return toast(msg(error));
  e.target.reset();
  $('#rblood').hidden = true;
  toast('অনুরোধ পোস্ট হয়েছে।');
  location.hash = '#posts';
};

fill($('#fcat'), Object.keys(CAT), CAT);
fill($('#rcat'), Object.keys(CAT), CAT);
fill($('#rbg'), BG);
fill($('#rurg'), Object.keys(URG), URG);
fill($('#fdist'), DIST);
fill($('#rdist'), DIST);

(function () {
  const t = new Date(), p = n => String(n).padStart(2, '0');
  const f = d => d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const m = new Date(t);
  m.setDate(m.getDate() + 30);
  $('#rdate').min = f(t);
  $('#rdate').max = f(m);
})();

window.addEventListener('hashchange', route);
sb.auth.getSession().then(({data}) => setUser(data.session ? data.session.user : null));
sb.auth.onAuthStateChange((ev, s) => {
  if (ev === 'TOKEN_REFRESHED') return;
  if (ev === 'PASSWORD_RECOVERY') { $('#frecov').hidden = false; location.hash = '#account'; }
  setUser(s ? s.user : null);
});
