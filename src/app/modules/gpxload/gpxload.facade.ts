/** Settings abstraction Facade
 * ************************************/
import {Injectable} from '@angular/core';
import {Observable, Subject} from 'rxjs';

import {AppInfo} from 'src/app/app.info';
import {SignalKClient} from 'signalk-client-angular';
import {SKResources} from '../skresources/';
import {GPX, GPXRoute, GPXTrack, GPXTrackSegment, GPXWaypoint} from './gpx';

@Injectable({ providedIn: 'root' })
export class GPXLoadFacade  {

   // **************** ATTRIBUTES ***************************
    private errorCount:number=0;
    private subCount:number=0;

    private uploadSource: Subject<number>;
    public uploaded$: Observable<any>;
    private gpx:GPX

   // *******************************************************    

    constructor(private app: AppInfo, 
                private skres: SKResources,
                public signalk: SignalKClient) { 
        this.uploadSource= new Subject<number>();
        this.uploaded$= this.uploadSource.asObservable();                     
    }

    // ** delete GPX object data **
    clear() { this.gpx= null }

    // ** parse GPX file
    parseFileData(data:any) {  
        let gpxData= {
            name: '',
            routes: [],
            waypoints: [],
            tracks: []
        }    
        this.gpx= new GPX();     
    
        if(!this.gpx.parse(data) ) { return null }

        let idx:number= 1;
        this.gpx.rte.forEach(r=> {           
            gpxData.routes.push( {
                name: (r['name']!='') ? r['name'] : `Rte: ${idx}`,
                description: (r['desc']) ? r['desc'] : (r['cmt']) ? r['cmt'] : '',
                wptcount: r['rtept'].length
            });
            idx++;
        });
        idx=1;
        this.gpx.wpt.forEach( w=> {
            gpxData.waypoints.push( {
                name: (w['name']) ? w['name'] :  `Wpt: ${idx}`,
                description: (w['desc']) ? w['desc'] : (w['cmt']) ? w['cmt'] : ''
            });
            idx++;
        });    
        idx=1;
        this.gpx.trk.forEach( t=> {
            gpxData.tracks.push( {
                name: (t['name']) ? t['name'] :  `Trk: ${idx}`,
                description: (t['desc']) ? t['desc'] : (t['cmt']) ? t['cmt'] : ''
            });
            idx++;
        });              
        return gpxData;       
    }    
    
    // ** upload selected resources to Signal K server **
    uploadToServer(res) {
        this.errorCount=0;
        this.subCount=0;

        for(let i=0; i<res.rte.selected.length; i++) {
            if(res.rte.selected[i]) { this.transformRoute(this.gpx.rte[i]) }
        }

        for(let i=0; i<res.wpt.selected.length; i++) {
            if(res.wpt.selected[i]) { this.transformWaypoint(this.gpx.wpt[i]) }
        }

        for(let i=0; i<res.trk.selected.length; i++) {
            if(res.trk.selected[i]) { this.transformTrack(this.gpx.trk[i]) }
        }        
    }

    // ** check all submissions are resolved and emit upload$
    checkComplete() {
        if(this.subCount==0) {
            this.app.saveConfig();
            this.uploadSource.next(this.errorCount);
            this.app.debug(`GPXLoad: complete: ${this.errorCount}`);
        }
    }

    // ** transform and upload route
    transformRoute(r: GPXRoute) {
        let skObj= this.skres.buildRoute( r.rtept.map( pt=> { return [pt.lon, pt.lat] }) );
        let rte= skObj[1];

        rte.name= r.name;
        rte.description= r.desc;
        // ** route properties **
        if(r.cmt) { rte.feature.properties['cmt']=r.cmt }
        if(r.src) { rte.feature.properties['src']=r.src }
        if(r.number) { rte.feature.properties['number']=r.number }
        if(r.type) { rte.feature.properties['type']=r.type }

        // Add list ow waypoints names
        rte.feature.properties['wptNames'] = r.rtept.map(pt => {
            return pt.name
        })

        this.subCount++;
        this.signalk.api.put(`/resources/routes/${skObj[0]}`, skObj[1])
        .subscribe( 
            r=> { 
                this.subCount--;
                if(r['state']=='COMPLETED') { 
                    this.app.debug('SUCCESS: Route added.');
                    this.app.config.selections.routes.push(skObj[0]);                        
                }
                else { this.errorCount++ }
                this.checkComplete();
            },
            err=> { this.errorCount++; this.subCount--; this.checkComplete() }
        );        
    }    
    
    // ** transform and upload waypoint
    transformWaypoint(pt: GPXWaypoint) {
        let wptObj= this.skres.buildWaypoint([pt.lon, pt.lat]);
        let wpt= wptObj[1];
        if(pt.ele) { 
            wpt.feature.geometry.coordinates.push(pt.ele) 
            wpt.position['altitude']= pt.ele;
        }        
        if(pt.name && pt.name.length!=0) { wpt.feature.properties['name']=pt.name } 
        if(pt.desc && pt.desc.length!=0) { wpt.feature.properties['description']=pt.desc } 
        if(pt.cmt) { wpt.feature.properties['cmt']=pt.cmt }
        if(pt.geoidHeight) { wpt.feature.properties['geoidHeight']=pt.geoidHeight }
        if(pt.src) { wpt.feature.properties['src']=pt.src }
        if(pt.sym) { wpt.feature.properties['sym']=pt.sym }
        if(pt.type) { wpt.feature.properties['type']=pt.type }
        if(pt.fix) { wpt.feature.properties['fix']=pt.fix }
        if(pt.sat) { wpt.feature.properties['sat']=pt.sat }
        if(pt.hdop) { wpt.feature.properties['hdop']=pt.hdop }
        if(pt.vdop) { wpt.feature.properties['vdop']=pt.vdop }
        if(pt.pdop) { wpt.feature.properties['pdop']=pt.pdop }
        if(pt.ageOfGpsData) { wpt.feature.properties['ageOfGpsData']=pt.ageOfGpsData }
        if(pt.dgpsid) { wpt.feature.properties['dgpsid']=pt.dgpsid }

        this.subCount++;
        this.signalk.api.put(`/resources/waypoints/${wptObj[0]}`, wptObj[1])
        .subscribe( 
            r=>{ 
                this.subCount--;
                if(r['state']=='COMPLETED') { 
                    this.app.debug('SUCCESS: Waypoint added.');
                    this.app.config.selections.waypoints.push(wptObj[0]);
                }
                else { this.errorCount++ }
                this.checkComplete();
            },
            err=> { this.errorCount++; this.subCount--; this.checkComplete() }
        );      
    }   

    // ** transform and upload track
    transformTrack(gpxtrk: GPXTrack) {
        let trk= {
            feature: { 
                type: 'Feature',
                geometry:{ type: 'MultiLineString', coordinates: [] },
                properties: {},
                id: ''
            }
        };
        if(gpxtrk.trkseg) { 
            gpxtrk.trkseg.forEach( (tseg:GPXTrackSegment)=> {
                let line= [];
                tseg.trkpt.forEach( (pt:GPXWaypoint)=> {
                    line.push([pt.lon, pt.lat]);
                });
                trk.feature.geometry.coordinates.push(line);
            });
        }        
        if(gpxtrk.name && gpxtrk.name.length!=0) { trk.feature.properties['name']=gpxtrk.name } 
        if(gpxtrk.desc && gpxtrk.desc.length!=0) { trk.feature.properties['description']=gpxtrk.desc } 
        if(gpxtrk.cmt) { trk.feature.properties['cmt']=gpxtrk.cmt }
        if(gpxtrk.src) { trk.feature.properties['src']=gpxtrk.src }
        if(gpxtrk.type) { trk.feature.properties['type']=gpxtrk.type }

        this.subCount++;
        this.signalk.api.post(`/resources/tracks`, trk)
        .subscribe( 
            r=>{ 
                this.subCount--;
                if(r['state']=='COMPLETED') { 
                    this.app.debug('SUCCESS: Track added.');
                }
                else { this.errorCount++ }
                this.checkComplete();
            },
            err=> { this.errorCount++; this.subCount--; this.checkComplete() }
        );      
    }     

}
