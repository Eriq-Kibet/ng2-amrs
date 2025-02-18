import { take } from 'rxjs/operators';
import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { ClinicDashboardCacheService } from '../../clinic-dashboard/services/clinic-dashboard-cache.service';
import { DailyScheduleResourceService } from '../../etl-api/daily-scheduled-resource.service';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as Moment from 'moment';
import { ActivatedRoute } from '@angular/router';
import { LocalStorageService } from 'src/app/utils/local-storage.service';

@Component({
  selector: 'daily-schedule-appointments',
  templateUrl: './daily-schedule-appointments.component.html',
  styleUrls: ['./daily-schedule.component.css']
})
export class DailyScheduleAppointmentsComponent implements OnInit, OnDestroy {
  @Input() public selectedDate: any;
  public filter: any = {
    programType: [],
    visitType: [],
    encounterType: []
  };
  public encodedParams: string = encodeURI(JSON.stringify(this.filter));
  public params: any = {
    programType: [],
    visitType: [],
    encounterType: []
  };
  public extraColumns: Array<any> = [
    {
      headerName: 'Program',
      width: 200,
      field: 'program'
    },
    {
      headerName: 'ART start date',
      width: 120,
      field: 'arv_first_regimen_start_date'
    },
    {
      headerName: 'Covid-19 Assessment Status',
      width: 250,
      field: 'covid_19_vaccination_status'
    },
    {
      headerName: 'TB Screening Date',
      width: 150,
      field: 'tb_screening_date'
    },
    {
      headerName: 'TB Screening Result',
      width: 200,
      field: 'tb_screening_result'
    },
    {
      headerName: 'Cervical Screening Date',
      width: 200,
      field: 'cervical_screening_date'
    },
    {
      headerName: 'Cervical Screening Method',
      width: 200,
      field: 'cervical_screening_method'
    },
    {
      headerName: 'Cervical Screening Result',
      width: 200,
      field: 'cervical_screening_result'
    },
    {
      headerName: 'SMS Consent Provided',
      width: 150,
      field: 'sms_consent_provided'
    },
    {
      headerName: 'SMS Time',
      width: 100,
      field: 'sms_receive_time'
    }
  ];
  public errors: any[] = [];
  private _showEarlyAppointments = false;
  public get showEarlyAppointments() {
    return this._showEarlyAppointments;
  }
  public set showEarlyAppointments(value) {
    this._showEarlyAppointments = value;
    if (value) {
      this.dailyAppointmentsPatientList = this.earlyAppointments;
    } else {
      this.dailyAppointmentsPatientList = this.withoutEarlyAppointments;
    }
  }

  public dailyAppointmentsPatientList: any[] = [];
  public allAppointments: any[] = [];
  public withoutEarlyAppointments: any[] = [];
  public earlyAppointments: any[] = [];
  public loadingDailyAppointments = false;
  public dataLoaded = false;
  public dataAppLoaded = true;
  public selectedClinic: any;
  public nextStartIndex = 0;
  public fetchCount = 0;
  public busyIndicator: any = {
    busy: false,
    message: 'Please wait...' // default message
  };
  @Input() public tab: any;
  @Input()
  set options(value) {
    this._data.next(value);
  }
  get options() {
    return this._data.getValue();
  }
  private _data = new BehaviorSubject<any>([]);
  private subs: Subscription[] = [];
  constructor(
    private clinicDashboardCacheService: ClinicDashboardCacheService,
    private dailyScheduleResource: DailyScheduleResourceService,
    private localStorageService: LocalStorageService,
    private route: ActivatedRoute
  ) {}

  public ngOnInit() {
    this.selectedDate = Moment().format('YYYY-MM-DD');

    const sub = this.clinicDashboardCacheService
      .getCurrentClinic()
      .subscribe((location) => {
        this.selectedClinic = location;
        if (this.clinicDashboardCacheService.didLocationChange(location)) {
          this.loadData();
        }
      });

    this.subs.push(sub);

    this.loadData();
  }

  public ngOnDestroy(): void {
    this.subs.forEach((sub) => {
      sub.unsubscribe();
    });
  }

  public loadData() {
    const routeSub = this.route.queryParams.subscribe((params: any) => {
      if (params.programType || params.department) {
        this.params = params;
        if (params.resetFilter && params.resetFilter === 'true') {
          this.dailyAppointmentsPatientList = [];
        } else {
          this.initParams();
          const searchParams = this.getQueryParams();
          this.getDailyAppointments(searchParams);
          this.clinicDashboardCacheService.setDailyTabCurrentDate(
            params.startDate
          );
        }
      } else {
        this.dailyAppointmentsPatientList = [];
      }
    });

    this.subs.push(routeSub);
  }

  public getDailyAppointments(params) {
    this.setBusy();
    this.loadingDailyAppointments = true;
    this.clinicDashboardCacheService.setIsLoading(
      this.loadingDailyAppointments
    );

    const result = this.dailyScheduleResource.getDailyAppointments(params);
    if (result === null) {
      throw new Error('Null daily appointments observable');
    } else {
      result.pipe(take(1)).subscribe(
        (patientList) => {
          if (patientList) {
            this.processAppointments(patientList);
            this.dataLoaded = true;
          } else {
            this.dataLoaded = true;
          }
          this.loadingDailyAppointments = false;
          this.clinicDashboardCacheService.setIsLoading(
            this.loadingDailyAppointments
          );
          this.setFree();
        },
        (error) => {
          this.loadingDailyAppointments = false;
          this.clinicDashboardCacheService.setIsLoading(
            this.loadingDailyAppointments
          );

          this.errors.push({
            id: 'Daily Schedule Appointments',
            message: 'error fetching daily schedule appointments'
          });
        }
      );
    }
  }

  public loadMoreAppointments() {
    this.loadingDailyAppointments = true;
    this.clinicDashboardCacheService.setIsLoading(
      this.loadingDailyAppointments
    );
    const params = this.getQueryParams();
    this.getDailyAppointments(params);
  }

  public processAppointments(patientList) {
    this.allAppointments = patientList;
    this.withoutEarlyAppointments = [];
    if (Array.isArray(patientList) && patientList.length > 0) {
      const rtcDate = Moment(this.getQueryParams().startDate);
      this.withoutEarlyAppointments = patientList.filter(
        (item) =>
          !(
            Moment(item.next_clinical_encounter_datetime).isBefore(
              rtcDate,
              'date'
            ) && rtcDate.isBefore(Moment(item.latest_rtc_date), 'date')
          )
      );
      this.earlyAppointments = patientList.filter(
        (item) =>
          Moment(item.next_clinical_encounter_datetime).isBefore(
            rtcDate,
            'date'
          ) && rtcDate.isBefore(Moment(item.latest_rtc_date), 'date')
      );
    }
    this.dailyAppointmentsPatientList = this.withoutEarlyAppointments;
  }

  private initParams() {
    this.loadingDailyAppointments = false;
    this.clinicDashboardCacheService.setIsLoading(
      this.loadingDailyAppointments
    );
    this.nextStartIndex = 0;
    this.dataLoaded = false;
    this._showEarlyAppointments = false;
    this.errors = [];
    this.dailyAppointmentsPatientList = [];
    console.log('Params', this.getQueryParams());
  }

  private getQueryParams() {
    let programType: any = [];
    let visitType: any = [];
    let encounterType: any = [];
    let department = '';

    if (this.params.programType && this.params.programType.length > 0) {
      programType = this.params.programType;
    }
    if (this.params.visitType && this.params.visitType.length > 0) {
      visitType = this.params.visitType;
    }
    if (this.params.encounterType && this.params.encounterType.length > 0) {
      encounterType = this.params.encounterType;
    }
    if (this.params.department && this.params.department.length > 0) {
      department = this.params.department;
    }
    return {
      startDate: this.params.startDate,
      startIndex: this.nextStartIndex,
      locationUuids: this.selectedClinic,
      department: department,
      programType: programType,
      visitType: visitType,
      encounterType: encounterType,
      limit: 1000
    };
  }

  private setBusy() {
    this.busyIndicator = {
      busy: true,
      message: 'Please wait...Loading'
    };
  }
  private setFree() {
    this.busyIndicator = {
      busy: false,
      message: ''
    };
  }
}
