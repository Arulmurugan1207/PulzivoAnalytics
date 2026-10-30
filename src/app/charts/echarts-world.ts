// Modular ECharts build: only what the dashboard world map needs
// (map series + tooltip + visualMap on the canvas renderer), instead of the
// full `echarts` package (~1.1 MB). Imported only by the lazy overview page.
import * as echarts from 'echarts/core';
import { MapChart } from 'echarts/charts';
import { TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export { echarts };
