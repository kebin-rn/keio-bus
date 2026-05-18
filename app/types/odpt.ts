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
