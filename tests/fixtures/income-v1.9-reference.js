// Frozen v1.9 ProfitLands calculation for comparison tests only.
// This fixture is injected inside economy-system.js's own closure.
  function oldLocationProfit(b,l,i){
    const t=BUSINESS_TYPES.find(x=>x.id===b.type);if(!t)return 0;
    const r=riskFor(b), e=state.economy, scale=1+tier()*.045;
    const difficulty=window.ProfitLandsDifficulty?.current?.()||{revenue:1,expenses:1};
    const country=window.ProfitLandsCountry?.current?.()||{demand:1,revenue:1,rent:1,wage:1};
    const countryDemand=Number(country.demand)||1;
    const countryRevenue=Number(country.revenue)||1;
    const countryCost=window.ProfitLandsCountry?.costIndex?.(country)||1;
    const industryStrength=window.ProfitLandsCountry?.industry?.(b.type)||1;
    const independent=b.locationManagementVersion===1;
    const lvl=1+((independent?(l.level||1):(b.level||1))-1)*.22;
    const marketing=independent?(l.marketing||0):(b.marketing||0);
    const efficiency=independent?(l.efficiency||0):(b.efficiency||0);
    const basePop=Math.max(5,Math.min(100,b.popularity||55));
    const loc=LOCS[l.id]||{demand:l.demand||1,rent:l.rent||1};
    const pop=Math.max(0,Math.min(100,(l.basePopularity??basePop)+marketing*1.5))/100;
    const seeded=Math.sin((state.day*97+i*31+String(l.id).length*17)+b.type.length)*43758.5453;
    const noise=(seeded-Math.floor(seeded))-.5;
    const random=1+noise*(r.vol*(1+tier()*.22)+.08);
    const demand=e.demandIndex*loc.demand*countryDemand*activeEffect('demand')*(1+(e.health-60)/250*r.econ);
    const revenue=t.baseRevenue*lvl*demand*countryRevenue*industryStrength*(Number(difficulty.revenue)||1)*(.45+pop*.8)*(1+marketing*.08)*Math.max(.55,random)*scale;
    const runningCost=t.baseExpense*lvl*loc.rent*countryCost*(Number(difficulty.expenses)||1)*e.rentIndex*e.wageIndex*e.supplyIndex*r.cost*activeEffect('supply')*(1+(100-e.health)/280*r.econ)*Math.max(.75,1-noise*.15) / (1+efficiency*.1);
    const advancement=window.ProfitLandsAdvancements?.modifiers?.(l);
    let profit=revenue*(advancement?.revenue||1)-runningCost*(advancement?.expenses||1);
    if(b.type==='software')profit*=activeEffect('tech');
    if(b.type==='hotel')profit*=activeEffect('travel');
    profit*=activeEffect('weather')>1?(1-(activeEffect('weather')-1)*.10*r.weather):1;
    if(independent){
      profit+=window.ProfitLandsLocationOps?.staffingAdjustment?.(b,l,revenue,runningCost)||0;
      if(Number.isFinite(b.initiativeUntilTime)&&b.initiativeUntilTime>Date.now())profit+=revenue*.12;
    }
    profit+=window.ProfitLandsEmpire?.delta?.(b,l,revenue,runningCost)||0;
    return profit;
  }
  function oldBusinessProfit(b){
    const locs=locationList(b);
    const total=locs.reduce((sum,l,i)=>sum+oldLocationProfit(b,l,i),0);
    const legacyBonus=b.locationManagementVersion===1?0:(window.ProfitLandsGrowth?.adjustProfit?.(b)||0);
    return Math.round(total+legacyBonus);
  }
  window.__baselineProfit={location:oldLocationProfit,business:oldBusinessProfit};
