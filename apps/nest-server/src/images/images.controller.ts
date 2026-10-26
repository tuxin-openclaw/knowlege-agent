import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ImagesService } from './images.service.js';

@Controller('api/images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}
  @Get() list(@Query('before') before?: string) {
    return this.images.list(before);
  }
  @Post() @HttpCode(202) create(@Body() body: unknown) {
    return this.images.create(body);
  }
}
