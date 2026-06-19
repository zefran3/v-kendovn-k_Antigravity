const pragueTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" }));
const dow = pragueTime.getDay(); // 0=Ne, 1=Po, ..., 6=So
const hour = pragueTime.getHours();

console.log("pragueTime:", pragueTime.toString());
console.log("Day of Week:", dow);
console.log("Hour:", hour);

const formatDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const tempSat = new Date(pragueTime);
tempSat.setDate(pragueTime.getDate() + (dow === 6 ? 0 : (dow === 0 ? -1 : 6 - dow)));
const tempSun = new Date(tempSat);
tempSun.setDate(tempSat.getDate() + 1);

const satISO = formatDateISO(tempSat);
const sunISO = formatDateISO(tempSun);

console.log("tempSat:", tempSat.toString());
console.log("tempSun:", tempSun.toString());
console.log("satISO:", satISO);
console.log("sunISO:", sunISO);

let targetDates: string[] = [];
if (dow === 6) { // Sobota
  if (hour >= 18) {
    targetDates = [sunISO];
  } else {
    targetDates = [satISO, sunISO];
  }
} else if (dow === 0) { // Neděle
  if (hour >= 18) {
    const nextSatDate = new Date(tempSat);
    nextSatDate.setDate(tempSat.getDate() + 7);
    const nextSunDate = new Date(nextSatDate);
    nextSunDate.setDate(nextSatDate.getDate() + 1);
    targetDates = [nextSatDate.toISOString().split('T')[0], nextSunDate.toISOString().split('T')[0]];
  } else {
    targetDates = [sunISO];
  }
} else {
  targetDates = [satISO, sunISO];
}

console.log("targetDates:", targetDates);
console.log("todayISO calculated as:", pragueTime.toISOString().split('T')[0]);
