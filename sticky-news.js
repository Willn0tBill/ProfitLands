(()=>{
  const newsPool=[
    ['market','NovaTech shares are drawing extra attention from investors today.'],
    ['market','Harbor Foods reports steady consumer demand across ProfitLands.'],
    ['market','Atlas Energy is watching fuel demand closely after a busy market session.'],
    ['market','Skyline Motors sees mixed demand as buyers compare new models.'],
    ['market','Investor confidence is moving slightly as the market waits for new reports.'],
    ['market','Trading volume is picking up as more companies prepare their next quarterly plans.'],
    ['business','A new café trend is bringing more foot traffic to popular downtown businesses.'],
    ['business','Restaurant demand is rising in areas with strong evening activity.'],
    ['business','Retailers are reporting a noticeable change in customer spending habits.'],
    ['business','Businesses with strong popularity are seeing more consistent customer traffic.'],
    ['business','A local promotion campaign has businesses competing for customer attention.'],
    ['business','Several companies are reviewing their operating costs after a busy day.'],
    ['business','Tourism is increasing demand for hotels and businesses near major attractions.'],
    ['business','University District businesses are preparing for another busy week of student traffic.'],
    ['business','The Tech District is attracting new startups and more demand for business services.'],
    ['world','Construction has started on a new commercial area, creating new opportunities for local businesses.'],
    ['world','Shipping activity is increasing across ProfitLands as companies restock their supplies.'],
    ['world','Fuel costs are being watched closely by transportation and logistics companies.'],
    ['world','Consumer confidence remains a major topic in today’s business reports.'],
    ['world','A new transportation project could change which districts are easiest to reach.'],
    ['world','Property demand is shifting as investors look for new areas to expand.'],
    ['world','Supply chain managers are preparing for possible delays in the next market cycle.'],
    ['world','A busy weekend is expected to increase spending around major commercial districts.'],
    ['world','Several companies are announcing expansion plans as the economy continues to change.'],
    ['market','Analysts are watching whether today’s market movement continues into the next update.'],
    ['business','Companies with upgraded equipment are reporting better day-to-day efficiency.'],
    ['business','Popular businesses are becoming more valuable targets for future expansion.'],
    ['world','A change in local rents is making location choices more important for expanding chains.']
  ];
  let lastNewsAt=0;
  const addAmbientNews=()=>{
    if(!window.state||!state.started)return;
    const now=Date.now();
    if(now-lastNewsAt<18000)return;
    lastNewsAt=now;
    let pool=newsPool;
    if(state.businesses?.length)pool=newsPool.filter(x=>x[0]!=='business'||state.businesses.length);
    const item=pool[Math.floor(Math.random()*pool.length)];
    state.news=Array.isArray(state.news)?state.news:[];
    state.news.push(item[1]);
    if(state.news.length>40)state.news=state.news.slice(-40);
    try{save();render()}catch(e){}
    requestAnimationFrame(()=>{
      const first=document.querySelector('#newsFeed .news-item');
      if(first)first.classList.add('news-'+item[0]);
    });
  };
  const install=()=>{
    const head=document.querySelector('.game-head');
    const stats=document.querySelector('.stats-grid');
    if(head)head.classList.add('persistent-hud-head');
    if(stats)stats.classList.add('persistent-hud-stats');
  };
  install();
  setInterval(install,1000);
  setInterval(addAmbientNews,18000);
})();