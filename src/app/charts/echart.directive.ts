import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, AfterViewInit, inject } from '@angular/core';
import type { EChartsType } from 'echarts/core';

/**
 * Minimal replacement for ngx-echarts over the modular `echarts/core` build
 * (see echarts-world.ts), loaded lazily. Usage: <div pzEchart [options]="opts"></div>
 */
@Directive({ selector: '[pzEchart]', standalone: true })
export class EchartDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() options: any = null;

  private el = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private chart: EChartsType | null = null;
  private destroyed = false;
  private ro: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    // echarts (modular build) is its own lazy chunk, fetched only when a map renders.
    import('./echarts-world').then(({ echarts }) => this.zone.runOutsideAngular(() => {
      if (this.destroyed) return;
      this.chart = echarts.init(this.el.nativeElement);
      if (this.options) this.chart.setOption(this.options, true);
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.chart?.resize());
        this.ro.observe(this.el.nativeElement);
      }
    }));
  }

  ngOnChanges(): void {
    if (this.chart && this.options) {
      this.zone.runOutsideAngular(() => this.chart!.setOption(this.options, true));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.ro?.disconnect();
    this.chart?.dispose();
    this.chart = null;
  }
}
