export interface OdptBus {
  "@id": string;
  "@type": "odpt:Bus";
  "dc:date"?: string;
  "owl:sameAs"?: string;
  "odpt:operator": string;
  "odpt:busroutePattern"?: string;
  "odpt:fromBusstopPole"?: string;
  "odpt:toBusstopPole"?: string;
  "odpt:fromBusstopPoleTime"?: string;
  "odpt:toBusstopPoleTime"?: string;
  "odpt:progress"?: number;
  "odpt:delay"?: number;
  "geo:lat"?: number;
  "geo:long"?: number;
  "odpt:azimuth"?: number;
  "odpt:speed"?: number;
  "odpt:vehicleNumber"?: string;
  "odpt:doorStatus"?: string;
  "odpt:occupancyStatus"?: string;
  "odpt:startingBusstopPole"?: string;
  "odpt:terminalBusstopPole"?: string;
  officeId?: string;
  tripHeadsign?: string;
  // 地図の経路表示用。停留所情報を扱わない便 (ハチ公バス) には付けない
  tripId?: string;
  stopSeq?: number; // 便の停留所列上の現在位置 (接近ボード・便詳細と同じ基準)
  beforeDeparture?: boolean; // 始発をまだ発車していない
  stopped?: boolean; // stopSeq の停留所に停車中 (false なら接近中)
}

export interface OdptBusroutePatternStop {
  "odpt:busstopPole": string;
  "odpt:index": number;
  "odpt:openingDoorsToRideOn"?: boolean;
  "odpt:openingDoorsToGetOff"?: boolean;
  "odpt:note"?: string;
}

export interface OdptBusroutePattern {
  "@id": string;
  "@type": "odpt:BusroutePattern";
  "owl:sameAs": string;
  "dc:title"?: string;
  "odpt:kana"?: string;
  "odpt:operator": string;
  "odpt:busroute"?: string;
  "odpt:direction"?: string;
  "odpt:pattern"?: OdptBusroutePatternStop[];
}

export interface OfficeEntry {
  name: string;
}

export interface OdptBusstopPole {
  "@id": string;
  "@type": "odpt:BusstopPole";
  "owl:sameAs": string;
  "dc:title": string;
  "odpt:kana"?: string;
  "odpt:operator": string[] | string;
  "geo:lat"?: number;
  "geo:long"?: number;
  "odpt:busstopPoleNumber"?: string;
}
