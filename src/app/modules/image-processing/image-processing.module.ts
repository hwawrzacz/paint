import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImageUploaderComponent } from '../../components/image-uploader/image-uploader.component';
import { ImageProcessingComponent } from '../../components/image-processing/image-processing.component';
import { ImageProcessingRoutingModule } from './image-processing-routing/image-processing-routing.module';

@NgModule({
  declarations: [ImageUploaderComponent, ImageProcessingComponent],
  imports: [
    CommonModule,
    ImageProcessingRoutingModule
  ]
})
export class ImageProcessingModule { }
